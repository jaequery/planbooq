import { Priority } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult, TicketWithRelations } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";
import { cancelAgentJob } from "@/server/services/agent-jobs";
import { ensureLegacyPrRecorded } from "@/server/services/ticket-pull-requests";
import {
  autoTransitionPlanningToTodo,
  moveTicketToStatusId,
} from "@/server/services/ticket-status";
import { workflowCommander } from "@/server/services/workflow-commander";

const TICKET_RELATIONS_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
  project: { select: { slug: true } },
  pullRequests: { orderBy: { openedAt: "desc" } },
} as const;

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

function safeInngest(name: string, data: Record<string, unknown>) {
  void inngest.send({ name, data }).catch((error: unknown) => {
    logger.warn("inngest.send.failed", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

// ---------------- Create ----------------

export const CreateTicketSchema = z.object({
  projectId: z.string().min(1),
  statusId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  plan: z.string().max(20000).optional(),
});

export async function createTicketSvc(
  userId: string,
  input: z.infer<typeof CreateTicketSchema>,
): Promise<ServerActionResult<TicketWithRelations>> {
  try {
    const data = CreateTicketSchema.parse(input);
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true, workspaceId: true, slug: true },
    });
    if (!project) return { ok: false, error: "invalid_project" };
    await requireMembership(project.workspaceId, userId);

    const status = await prisma.status.findUnique({ where: { id: data.statusId } });
    if (!status || status.workspaceId !== project.workspaceId) {
      return { ok: false, error: "invalid_status" };
    }

    const normalizedTitle = data.title.trim();
    const dedupeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const duplicate = await prisma.ticket.findFirst({
      where: {
        projectId: project.id,
        archivedAt: null,
        title: { equals: normalizedTitle, mode: "insensitive" },
        createdAt: { gte: dedupeWindow },
        status: { key: { not: "completed" } },
      },
      select: { id: true },
    });
    if (duplicate) return { ok: false, error: "duplicate_title" };

    const last = await prisma.ticket.findFirst({
      where: { projectId: project.id, statusId: data.statusId, archivedAt: null },
      orderBy: { position: "desc" },
    });
    const position = (last?.position ?? 0) + 1;

    const ticket = await prisma.ticket.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        statusId: data.statusId,
        title: data.title,
        description: data.description,
        plan: data.plan?.trim() ? data.plan : null,
        position,
        createdById: userId,
      },
      include: TICKET_RELATIONS_INCLUDE,
    });

    await publishWorkspaceEvent(project.workspaceId, {
      name: "ticket.created",
      ticketId: ticket.id,
      workspaceId: project.workspaceId,
      projectId: project.id,
      ticket,
      by: userId,
    });
    safeInngest("ticket/created", { ticketId: ticket.id, workspaceId: project.workspaceId });

    let result = ticket;
    if (data.plan?.trim()) {
      const moved = await autoTransitionPlanningToTodo({ ticketId: ticket.id, byUserId: userId });
      if (moved) {
        const refreshed = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          include: TICKET_RELATIONS_INCLUDE,
        });
        if (refreshed) result = refreshed;
      }
    }
    return { ok: true, data: result };
  } catch (error) {
    logger.error("createTicketSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// ---------------- Update ----------------

export const UpdateTicketSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    plan: z.string().max(20000).nullable().optional(),
    priority: z.nativeEnum(Priority).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    labelIds: z.array(z.string().min(1)).optional(),
    prUrl: z.string().url().max(500).nullable().optional(),
  })
  .strict();

export async function updateTicketSvc(
  userId: string,
  ticketId: string,
  input: z.infer<typeof UpdateTicketSchema>,
): Promise<ServerActionResult<TicketWithRelations>> {
  try {
    const data = UpdateTicketSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.archivedAt) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    if (data.assigneeId) {
      const member = await prisma.member.findUnique({
        where: {
          workspaceId_userId: { workspaceId: ticket.workspaceId, userId: data.assigneeId },
        },
      });
      if (!member) return { ok: false, error: "invalid_assignee" };
    }

    if (data.labelIds && data.labelIds.length > 0) {
      const labels = await prisma.label.findMany({
        where: { id: { in: data.labelIds } },
        select: { id: true, workspaceId: true },
      });
      if (labels.length !== data.labelIds.length) return { ok: false, error: "invalid_label" };
      if (labels.some((l) => l.workspaceId !== ticket.workspaceId))
        return { ok: false, error: "invalid_label" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description?.trim() ? data.description : null;
    if (data.plan !== undefined) updateData.plan = data.plan?.trim() ? data.plan : null;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.labelIds !== undefined)
      updateData.labels = { set: data.labelIds.map((id) => ({ id })) };
    if (data.prUrl !== undefined) updateData.prUrl = data.prUrl?.trim() ? data.prUrl : null;

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: updateData,
      include: TICKET_RELATIONS_INCLUDE,
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.updated",
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      ticket: updated,
      by: userId,
    });

    let result = updated;
    if (data.plan?.trim()) {
      const moved = await autoTransitionPlanningToTodo({ ticketId: ticket.id, byUserId: userId });
      if (moved) {
        const refreshed = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          include: TICKET_RELATIONS_INCLUDE,
        });
        if (refreshed) result = refreshed;
      }
    }
    return { ok: true, data: result };
  } catch (error) {
    logger.error("updateTicketSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// ---------------- Move ----------------

export const MoveTicketSchema = z
  .object({
    toStatusId: z.string().min(1),
    beforeTicketId: z.string().min(1).nullable().optional(),
    afterTicketId: z.string().min(1).nullable().optional(),
  })
  .strict();

export async function moveTicketSvc(
  userId: string,
  ticketId: string,
  input: z.infer<typeof MoveTicketSchema>,
): Promise<ServerActionResult<{ ticketId: string; toStatusId: string; position: number }>> {
  try {
    const parsed = MoveTicketSchema.parse(input);
    const beforeTicketId = parsed.beforeTicketId ?? null;
    const afterTicketId = parsed.afterTicketId ?? null;
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };
    await requireMembership(ticket.workspaceId, userId);
    const moved = await moveTicketToStatusId({
      ticketId,
      toStatusId: parsed.toStatusId,
      beforeTicketId,
      afterTicketId,
      by: userId,
      activityByUserId: userId,
    });
    return {
      ok: true,
      data: { ticketId, toStatusId: parsed.toStatusId, position: moved.position },
    };
  } catch (error) {
    logger.error("moveTicketSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// ---------------- Archive / Delete ----------------

export async function archiveTicketSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<{ ticketId: string }>> {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.archivedAt) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { archivedAt: new Date() },
    });
    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.archived",
      ticketId,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      by: userId,
    });
    return { ok: true, data: { ticketId } };
  } catch (error) {
    logger.error("archiveTicketSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function unarchiveTicketSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<TicketWithRelations>> {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (!ticket.archivedAt) return { ok: false, error: "ticket_not_archived" };
    await requireMembership(ticket.workspaceId, userId);
    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: { archivedAt: null },
      include: TICKET_RELATIONS_INCLUDE,
    });
    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.unarchived",
      ticketId,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      ticket: updated,
      by: userId,
    });
    return { ok: true, data: updated };
  } catch (error) {
    logger.error("unarchiveTicketSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function deleteTicketSvc(
  userId: string,
  ticketId: string,
): Promise<
  ServerActionResult<{ id: string; workspaceId: string; projectId: string; statusId: string }>
> {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    // Pre-delete cleanup of in-flight work. The Prisma `onDelete: Cascade`
    // alone removes AgentJob / WorkflowRun rows but does not signal the
    // desktop agent to SIGTERM its `claude` child (that requires a
    // `job.cancel` event on the agent channel) and does not stop Inngest's
    // step-completion handler from advancing to the next workflow step
    // (it CAS-updates against status RUNNING, which only flips here).
    // Worktree teardown on the desktop is the agent's job once it receives
    // `job.cancel`; we don't drive that from the server.
    const runningJobs = await prisma.agentJob.findMany({
      where: { ticketId, status: { in: ["PENDING", "RUNNING"] } },
      select: { id: true },
    });
    if (runningJobs.length > 0) {
      await Promise.allSettled(
        runningJobs.map((j) =>
          cancelAgentJob({
            jobId: j.id,
            reason: "ticket_deleted",
            byUserId: userId,
            reconcileTicket: false,
          }),
        ),
      );
    }

    const runningRuns = await prisma.workflowRun.findMany({
      where: { ticketId, status: { in: ["PENDING", "RUNNING"] } },
      select: { id: true },
    });
    if (runningRuns.length > 0) {
      await Promise.allSettled(
        runningRuns.map((r) =>
          workflowCommander.cancelRun({ runId: r.id, reason: "ticket_deleted" }),
        ),
      );
    }

    await prisma.ticket.delete({ where: { id: ticketId } });
    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.deleted",
      ticketId,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      statusId: ticket.statusId,
      by: userId,
    });
    return {
      ok: true,
      data: {
        id: ticket.id,
        workspaceId: ticket.workspaceId,
        projectId: ticket.projectId,
        statusId: ticket.statusId,
      },
    };
  } catch (error) {
    logger.error("deleteTicketSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// ---------------- Read ----------------

export async function getTicketSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<TicketWithRelations>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: TICKET_RELATIONS_INCLUDE,
  });
  if (!ticket) return { ok: false, error: "ticket_not_found" };
  try {
    await requireMembership(ticket.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  if (ticket.prUrl && ticket.pullRequests.length === 0) {
    await ensureLegacyPrRecorded(ticket.id, ticket.prUrl).catch(() => undefined);
    const refreshed = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: TICKET_RELATIONS_INCLUDE,
    });
    if (refreshed) return { ok: true, data: refreshed };
  }
  return { ok: true, data: ticket };
}

export async function listArchivedProjectTicketsSvc(
  userId: string,
  projectId: string,
  opts: { limit?: number } = {},
): Promise<ServerActionResult<{ items: TicketWithRelations[] }>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) return { ok: false, error: "invalid_project" };
  try {
    await requireMembership(project.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const items = await prisma.ticket.findMany({
    where: { projectId, archivedAt: { not: null } },
    include: TICKET_RELATIONS_INCLUDE,
    orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return { ok: true, data: { items } };
}

export async function listProjectTicketsSvc(
  userId: string,
  projectId: string,
  opts: {
    statusId?: string;
    assigneeId?: string;
    includeArchived?: boolean;
    cursor?: string | null;
    limit?: number;
  },
): Promise<ServerActionResult<{ items: TicketWithRelations[]; nextCursor: string | null }>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) return { ok: false, error: "invalid_project" };
  try {
    await requireMembership(project.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const items = await prisma.ticket.findMany({
    where: {
      projectId,
      ...(opts.statusId ? { statusId: opts.statusId } : {}),
      ...(opts.assigneeId ? { assigneeId: opts.assigneeId } : {}),
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    include: TICKET_RELATIONS_INCLUDE,
    orderBy: [{ statusId: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const nextCursor = items.length > limit ? (items[limit - 1]?.id ?? null) : null;
  return { ok: true, data: { items: items.slice(0, limit), nextCursor } };
}

import { Priority } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult, TicketWithRelations } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

const TICKET_RELATIONS_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
  project: { select: { slug: true } },
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
    return { ok: true, data: ticket };
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
    return { ok: true, data: updated };
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
    const fromStatusId = ticket.statusId;

    const targetStatus = await prisma.status.findUnique({ where: { id: parsed.toStatusId } });
    if (!targetStatus || targetStatus.workspaceId !== ticket.workspaceId) {
      return { ok: false, error: "invalid_status" };
    }

    const finalPosition = await prisma.$transaction(async (tx) => {
      const [before, after] = await Promise.all([
        beforeTicketId
          ? tx.ticket.findUnique({ where: { id: beforeTicketId } })
          : Promise.resolve(null),
        afterTicketId
          ? tx.ticket.findUnique({ where: { id: afterTicketId } })
          : Promise.resolve(null),
      ]);
      if (beforeTicketId) {
        if (
          !before ||
          before.workspaceId !== ticket.workspaceId ||
          before.projectId !== ticket.projectId ||
          before.statusId !== parsed.toStatusId ||
          before.archivedAt
        )
          throw new Error("invalid_anchor_before");
      }
      if (afterTicketId) {
        if (
          !after ||
          after.workspaceId !== ticket.workspaceId ||
          after.projectId !== ticket.projectId ||
          after.statusId !== parsed.toStatusId ||
          after.archivedAt
        )
          throw new Error("invalid_anchor_after");
      }

      let position: number;
      if (before && after) position = (before.position + after.position) / 2;
      else if (after && !before) position = after.position - 1;
      else if (before && !after) position = before.position + 1;
      else {
        const last = await tx.ticket.findFirst({
          where: {
            statusId: parsed.toStatusId,
            projectId: ticket.projectId,
            workspaceId: ticket.workspaceId,
            archivedAt: null,
          },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        position = (last?.position ?? 0) + 1;
      }

      const r = await tx.ticket.updateMany({
        where: { id: ticketId, workspaceId: ticket.workspaceId },
        data: { statusId: parsed.toStatusId, position },
      });
      if (r.count !== 1) throw new Error("ticket_update_failed");
      return position;
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.moved",
      ticketId,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      fromStatusId,
      toStatusId: parsed.toStatusId,
      position: finalPosition,
      by: userId,
    });
    safeInngest("ticket/moved", { ticketId, workspaceId: ticket.workspaceId });
    return {
      ok: true,
      data: { ticketId, toStatusId: parsed.toStatusId, position: finalPosition },
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
  return { ok: true, data: ticket };
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

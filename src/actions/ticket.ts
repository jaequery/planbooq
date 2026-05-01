"use server";

import type { Label } from "@prisma/client";
import { Priority } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult, TicketAssignee, TicketWithRelations } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

const TICKET_RELATIONS_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
} as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("unauthorized");
  }
  return session.user.id;
}

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

const MoveSchema = z
  .object({
    ticketId: z.string().min(1),
    toStatusId: z.string().min(1),
    beforeTicketId: z.string().min(1).nullable().optional(),
    afterTicketId: z.string().min(1).nullable().optional(),
  })
  .strict();

export async function moveTicket(
  input: z.infer<typeof MoveSchema>,
): Promise<ServerActionResult<{ ticketId: string; toStatusId: string; position: number }>> {
  try {
    const parsed = MoveSchema.parse(input);
    const { ticketId, toStatusId } = parsed;
    const beforeTicketId = parsed.beforeTicketId ?? null;
    const afterTicketId = parsed.afterTicketId ?? null;
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };

    await requireMembership(ticket.workspaceId, userId);
    const fromStatusId = ticket.statusId;

    const targetStatus = await prisma.status.findUnique({ where: { id: toStatusId } });
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
          before.statusId !== toStatusId ||
          before.archivedAt
        ) {
          throw new Error("invalid_anchor_before");
        }
      }
      if (afterTicketId) {
        if (
          !after ||
          after.workspaceId !== ticket.workspaceId ||
          after.projectId !== ticket.projectId ||
          after.statusId !== toStatusId ||
          after.archivedAt
        ) {
          throw new Error("invalid_anchor_after");
        }
      }

      let position: number;
      if (before && after) {
        position = (before.position + after.position) / 2;
      } else if (after && !before) {
        position = after.position - 1;
      } else if (before && !after) {
        position = before.position + 1;
      } else {
        const last = await tx.ticket.findFirst({
          where: {
            statusId: toStatusId,
            projectId: ticket.projectId,
            workspaceId: ticket.workspaceId,
            archivedAt: null,
          },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        position = (last?.position ?? 0) + 1;
      }

      const updateResult = await tx.ticket.updateMany({
        where: { id: ticketId, workspaceId: ticket.workspaceId },
        data: { statusId: toStatusId, position },
      });
      if (updateResult.count !== 1) {
        throw new Error("ticket_update_failed");
      }
      return position;
    });

    const updated = { id: ticketId };

    const project = await prisma.project.findUnique({
      where: { id: ticket.projectId },
      select: { slug: true },
    });
    if (project) revalidatePath(`/p/${project.slug}`);

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.moved",
      ticketId: updated.id,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      fromStatusId,
      toStatusId,
      position: finalPosition,
      by: userId,
    });

    void inngest
      .send({
        name: "ticket/moved",
        data: { ticketId: updated.id, workspaceId: ticket.workspaceId },
      })
      .catch((error: unknown) => {
        logger.warn("inngest.send.failed", {
          name: "ticket/moved",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return {
      ok: true,
      data: { ticketId: updated.id, toStatusId, position: finalPosition },
    };
  } catch (error) {
    logger.error("moveTicket.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const CreateSchema = z.object({
  projectId: z.string().min(1),
  statusId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
});

export async function createTicket(
  input: z.infer<typeof CreateSchema>,
): Promise<ServerActionResult<TicketWithRelations>> {
  try {
    const data = CreateSchema.parse(input);
    const userId = await requireUserId();

    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true, workspaceId: true, slug: true },
    });
    if (!project) {
      return { ok: false, error: "invalid_project" };
    }
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

    revalidatePath(`/p/${project.slug}`);

    await publishWorkspaceEvent(project.workspaceId, {
      name: "ticket.created",
      ticketId: ticket.id,
      workspaceId: project.workspaceId,
      projectId: project.id,
      ticket,
      by: userId,
    });

    void inngest
      .send({
        name: "ticket/created",
        data: { ticketId: ticket.id, workspaceId: project.workspaceId },
      })
      .catch((error: unknown) => {
        logger.warn("inngest.send.failed", {
          name: "ticket/created",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return { ok: true, data: ticket };
  } catch (error) {
    logger.error("createTicket.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const UpdateSchema = z
  .object({
    ticketId: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    priority: z.nativeEnum(Priority).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    labelIds: z.array(z.string().min(1)).optional(),
    prUrl: z.string().url().max(500).nullable().optional(),
  })
  .strict();

export async function updateTicket(
  input: z.infer<typeof UpdateSchema>,
): Promise<ServerActionResult<TicketWithRelations>> {
  try {
    const data = UpdateSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({ where: { id: data.ticketId } });
    if (!ticket || ticket.archivedAt) {
      return { ok: false, error: "ticket_not_found" };
    }
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
      if (labels.length !== data.labelIds.length) {
        return { ok: false, error: "invalid_label" };
      }
      if (labels.some((l) => l.workspaceId !== ticket.workspaceId)) {
        return { ok: false, error: "invalid_label" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) {
      updateData.description = data.description?.trim() ? data.description : null;
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.labelIds !== undefined) {
      updateData.labels = { set: data.labelIds.map((id) => ({ id })) };
    }
    if (data.prUrl !== undefined) {
      updateData.prUrl = data.prUrl?.trim() ? data.prUrl : null;
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: updateData,
      include: TICKET_RELATIONS_INCLUDE,
    });

    const project = await prisma.project.findUnique({
      where: { id: ticket.projectId },
      select: { slug: true },
    });
    if (project) revalidatePath(`/p/${project.slug}`);

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
    logger.error("updateTicket.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const ArchiveSchema = z
  .object({
    ticketId: z.string().min(1),
  })
  .strict();

export async function archiveTicket(
  input: z.infer<typeof ArchiveSchema>,
): Promise<ServerActionResult<{ ticketId: string }>> {
  try {
    const data = ArchiveSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({ where: { id: data.ticketId } });
    if (!ticket || ticket.archivedAt) {
      return { ok: false, error: "ticket_not_found" };
    }
    await requireMembership(ticket.workspaceId, userId);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { archivedAt: new Date() },
    });

    const project = await prisma.project.findUnique({
      where: { id: ticket.projectId },
      select: { slug: true },
    });
    if (project) revalidatePath(`/p/${project.slug}`);

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.archived",
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      by: userId,
    });

    return { ok: true, data: { ticketId: ticket.id } };
  } catch (error) {
    logger.error("archiveTicket.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const DeleteSchema = z.object({ ticketId: z.string().min(1) }).strict();

export async function deleteTicket(input: z.infer<typeof DeleteSchema>): Promise<
  ServerActionResult<{
    id: string;
    workspaceId: string;
    projectId: string;
    statusId: string;
  }>
> {
  try {
    const data = DeleteSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({ where: { id: data.ticketId } });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    await prisma.ticket.delete({ where: { id: ticket.id } });

    const project = await prisma.project.findUnique({
      where: { id: ticket.projectId },
      select: { slug: true },
    });
    if (project) revalidatePath(`/p/${project.slug}`);

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.deleted",
      ticketId: ticket.id,
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
    logger.error("deleteTicket.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const ListLabelsSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function listLabels(
  input: z.infer<typeof ListLabelsSchema>,
): Promise<ServerActionResult<Label[]>> {
  try {
    const { workspaceId } = ListLabelsSchema.parse(input);
    const userId = await requireUserId();
    await requireMembership(workspaceId, userId);

    const labels = await prisma.label.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    });
    return { ok: true, data: labels };
  } catch (error) {
    logger.error("listLabels.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const CreateLabelSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z
      .string()
      .min(1)
      .max(32)
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "name_empty"),
    color: z.string().refine((c) => HEX_COLOR.test(c), "invalid_color"),
  })
  .strict();

export async function createLabel(
  input: z.infer<typeof CreateLabelSchema>,
): Promise<ServerActionResult<Label>> {
  try {
    const data = CreateLabelSchema.parse(input);
    const userId = await requireUserId();
    await requireMembership(data.workspaceId, userId);

    try {
      const label = await prisma.label.create({
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          color: data.color,
        },
      });
      return { ok: true, data: label };
    } catch (e) {
      if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") {
        return { ok: false, error: "label_name_taken" };
      }
      throw e;
    }
  } catch (error) {
    logger.error("createLabel.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const ListMembersSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function listWorkspaceMembers(
  input: z.infer<typeof ListMembersSchema>,
): Promise<ServerActionResult<{ user: TicketAssignee }[]>> {
  try {
    const { workspaceId } = ListMembersSchema.parse(input);
    const userId = await requireUserId();
    await requireMembership(workspaceId, userId);

    const members = await prisma.member.findMany({
      where: { workspaceId },
      select: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return { ok: true, data: members };
  } catch (error) {
    logger.error("listWorkspaceMembers.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

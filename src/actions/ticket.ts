"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult, Ticket } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

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
): Promise<ServerActionResult<Ticket>> {
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
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
  })
  .strict();

export async function updateTicket(
  input: z.infer<typeof UpdateSchema>,
): Promise<ServerActionResult<Ticket>> {
  try {
    const data = UpdateSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({ where: { id: data.ticketId } });
    if (!ticket || ticket.archivedAt) {
      return { ok: false, error: "ticket_not_found" };
    }
    await requireMembership(ticket.workspaceId, userId);

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        title: data.title,
        description: data.description?.trim() ? data.description : null,
      },
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

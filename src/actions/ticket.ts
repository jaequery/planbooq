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
          before.statusId !== toStatusId
        ) {
          throw new Error("invalid_anchor_before");
        }
      }
      if (afterTicketId) {
        if (!after || after.workspaceId !== ticket.workspaceId || after.statusId !== toStatusId) {
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
          where: { statusId: toStatusId, workspaceId: ticket.workspaceId },
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

    const workspace = await prisma.workspace.findUnique({
      where: { id: ticket.workspaceId },
      select: { slug: true },
    });
    if (workspace) revalidatePath(`/w/${workspace.slug}`);

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.moved",
      ticketId: updated.id,
      workspaceId: ticket.workspaceId,
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
  workspaceId: z.string().min(1),
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
    await requireMembership(data.workspaceId, userId);

    const status = await prisma.status.findUnique({ where: { id: data.statusId } });
    if (!status || status.workspaceId !== data.workspaceId) {
      return { ok: false, error: "invalid_status" };
    }

    const last = await prisma.ticket.findFirst({
      where: { statusId: data.statusId },
      orderBy: { position: "desc" },
    });
    const position = (last?.position ?? 0) + 1;

    const ticket = await prisma.ticket.create({
      data: {
        workspaceId: data.workspaceId,
        statusId: data.statusId,
        title: data.title,
        description: data.description,
        position,
        createdById: userId,
      },
    });

    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { slug: true },
    });
    if (workspace) revalidatePath(`/w/${workspace.slug}`);

    await publishWorkspaceEvent(data.workspaceId, {
      name: "ticket.created",
      ticketId: ticket.id,
      workspaceId: data.workspaceId,
      ticket,
      by: userId,
    });

    void inngest
      .send({
        name: "ticket/created",
        data: { ticketId: ticket.id, workspaceId: data.workspaceId },
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

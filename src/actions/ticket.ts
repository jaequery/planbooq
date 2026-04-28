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

const MoveSchema = z.object({
  ticketId: z.string().min(1),
  toStatusId: z.string().min(1),
  newPosition: z.number().finite().optional(),
});

export async function moveTicket(
  input: z.infer<typeof MoveSchema>,
): Promise<ServerActionResult<{ ticketId: string; toStatusId: string; position: number }>> {
  try {
    const { ticketId, toStatusId, newPosition } = MoveSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return { ok: false, error: "ticket_not_found" };

    await requireMembership(ticket.workspaceId, userId);

    const targetStatus = await prisma.status.findUnique({ where: { id: toStatusId } });
    if (!targetStatus || targetStatus.workspaceId !== ticket.workspaceId) {
      return { ok: false, error: "invalid_status" };
    }

    let finalPosition = newPosition;
    if (typeof finalPosition !== "number") {
      const last = await prisma.ticket.findFirst({
        where: { statusId: toStatusId },
        orderBy: { position: "desc" },
      });
      finalPosition = (last?.position ?? 0) + 1;
    }

    const fromStatusId = ticket.statusId;
    const updateResult = await prisma.ticket.updateMany({
      where: { id: ticketId, workspaceId: ticket.workspaceId },
      data: { statusId: toStatusId, position: finalPosition },
    });
    if (updateResult.count !== 1) {
      return { ok: false, error: "ticket_update_failed" };
    }
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

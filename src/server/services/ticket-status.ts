import "server-only";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

/**
 * Move a ticket to the status with the given key (e.g. "todo", "building").
 * Appends to the end of the destination column. Shared by drag-reorder and
 * status-aware CTAs.
 */
export async function moveTicketToStatusKey(args: {
  ticketId: string;
  toStatusKey: string;
  byUserId: string;
}): Promise<{ fromStatusId: string; toStatusId: string; position: number } | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      statusId: true,
      archivedAt: true,
    },
  });
  if (!ticket || ticket.archivedAt) return null;

  const target = await prisma.status.findUnique({
    where: {
      workspaceId_key: { workspaceId: ticket.workspaceId, key: args.toStatusKey },
    },
    select: { id: true },
  });
  if (!target) return null;

  const fromStatusId = ticket.statusId;
  if (fromStatusId === target.id) {
    return { fromStatusId, toStatusId: target.id, position: 0 };
  }

  const last = await prisma.ticket.findFirst({
    where: {
      statusId: target.id,
      projectId: ticket.projectId,
      workspaceId: ticket.workspaceId,
      archivedAt: null,
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + 1;

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { statusId: target.id, position },
  });

  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
    select: { slug: true },
  });
  if (project) revalidatePath(`/p/${project.slug}`);

  await publishWorkspaceEvent(ticket.workspaceId, {
    name: "ticket.moved",
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    projectId: ticket.projectId,
    fromStatusId,
    toStatusId: target.id,
    position,
    by: args.byUserId,
  });

  void inngest
    .send({
      name: "ticket/moved",
      data: { ticketId: ticket.id, workspaceId: ticket.workspaceId },
    })
    .catch((error: unknown) => {
      logger.warn("inngest.send.failed", {
        name: "ticket/moved",
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return { fromStatusId, toStatusId: target.id, position };
}

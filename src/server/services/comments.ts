import type { Comment } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true, email: true, image: true } },
} as const;

export type CommentWithAuthor = Comment & {
  author: { id: string; name: string | null; email: string; image: string | null };
};

async function requireMembership(workspaceId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

export const CreateCommentSchema = z
  .object({
    ticketId: z.string().min(1),
    body: z.string().min(1).max(10_000),
  })
  .strict();

export async function createCommentSvc(
  userId: string,
  input: z.infer<typeof CreateCommentSchema>,
): Promise<ServerActionResult<CommentWithAuthor>> {
  try {
    const data = CreateCommentSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({
      where: { id: data.ticketId },
      select: { id: true, workspaceId: true, projectId: true, archivedAt: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };
    await requireMembership(ticket.workspaceId, userId);

    const comment = await prisma.comment.create({
      data: {
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
        authorId: userId,
        body: data.body,
      },
      include: COMMENT_INCLUDE,
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "comment.created",
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      ticketId: ticket.id,
      comment,
      by: userId,
    });
    return { ok: true, data: comment };
  } catch (error) {
    logger.error("createCommentSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export const UpdateCommentSchema = z.object({ body: z.string().min(1).max(10_000) }).strict();

export async function updateCommentSvc(
  userId: string,
  commentId: string,
  input: z.infer<typeof UpdateCommentSchema>,
): Promise<ServerActionResult<CommentWithAuthor>> {
  try {
    const data = UpdateCommentSchema.parse(input);
    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing) return { ok: false, error: "comment_not_found" };
    if (existing.authorId !== userId) return { ok: false, error: "forbidden" };
    await requireMembership(existing.workspaceId, userId);

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { body: data.body },
      include: COMMENT_INCLUDE,
    });

    const ticket = await prisma.ticket.findUnique({
      where: { id: existing.ticketId },
      select: { projectId: true },
    });
    await publishWorkspaceEvent(existing.workspaceId, {
      name: "comment.updated",
      workspaceId: existing.workspaceId,
      projectId: ticket?.projectId ?? "",
      ticketId: existing.ticketId,
      comment: updated,
      by: userId,
    });
    return { ok: true, data: updated };
  } catch (error) {
    logger.error("updateCommentSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function deleteCommentSvc(
  userId: string,
  commentId: string,
): Promise<ServerActionResult<{ id: string; ticketId: string }>> {
  try {
    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing) return { ok: false, error: "comment_not_found" };
    if (existing.authorId !== userId) return { ok: false, error: "forbidden" };
    await requireMembership(existing.workspaceId, userId);

    await prisma.comment.delete({ where: { id: commentId } });

    const ticket = await prisma.ticket.findUnique({
      where: { id: existing.ticketId },
      select: { projectId: true },
    });
    await publishWorkspaceEvent(existing.workspaceId, {
      name: "comment.deleted",
      workspaceId: existing.workspaceId,
      projectId: ticket?.projectId ?? "",
      ticketId: existing.ticketId,
      commentId: existing.id,
      by: userId,
    });
    return { ok: true, data: { id: existing.id, ticketId: existing.ticketId } };
  } catch (error) {
    logger.error("deleteCommentSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function listTicketCommentsSvc(
  userId: string,
  ticketId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<ServerActionResult<{ items: CommentWithAuthor[]; nextCursor: string | null }>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return { ok: false, error: "ticket_not_found" };
  try {
    await requireMembership(ticket.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const items = await prisma.comment.findMany({
    where: { ticketId },
    include: COMMENT_INCLUDE,
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const nextCursor = items.length > limit ? (items[limit - 1]?.id ?? null) : null;
  return { ok: true, data: { items: items.slice(0, limit), nextCursor } };
}

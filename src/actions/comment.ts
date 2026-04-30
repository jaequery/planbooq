"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import {
  type CommentWithAuthor,
  createCommentSvc,
  deleteCommentSvc,
  listTicketCommentsSvc,
} from "@/server/services/comments";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("unauthorized");
  }
  return session.user.id;
}

export async function listTicketComments(
  ticketId: string,
): Promise<ServerActionResult<{ items: CommentWithAuthor[] }>> {
  try {
    const userId = await requireUserId();
    const result = await listTicketCommentsSvc(userId, ticketId);
    if (!result.ok) return result;
    return { ok: true, data: { items: result.data.items } };
  } catch (error) {
    logger.error("listTicketComments.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function createComment(input: {
  ticketId: string;
  body: string;
}): Promise<ServerActionResult<CommentWithAuthor>> {
  try {
    const userId = await requireUserId();
    const result = await createCommentSvc(userId, input);
    if (!result.ok) return result;
    revalidatePath("/");
    return result;
  } catch (error) {
    logger.error("createComment.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function deleteComment(
  commentId: string,
): Promise<ServerActionResult<{ id: string; ticketId: string }>> {
  try {
    const userId = await requireUserId();
    const result = await deleteCommentSvc(userId, commentId);
    if (!result.ok) return result;
    revalidatePath("/");
    return result;
  } catch (error) {
    logger.error("deleteComment.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

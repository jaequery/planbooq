import type { MessageReaction } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { prisma } from "@/server/db";

async function requireMembership(workspaceId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

const EMOJI = z.string().min(1).max(32);

export async function addReactionSvc(
  userId: string,
  messageId: string,
  emoji: string,
): Promise<ServerActionResult<MessageReaction>> {
  try {
    EMOJI.parse(emoji);
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, workspaceId: true },
    });
    if (!message) return { ok: false, error: "message_not_found" };
    await requireMembership(message.workspaceId, userId);

    // Unique on (messageId, userId, emoji) — duplicate clicks no-op.
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      create: { messageId, userId, emoji },
      update: {},
    });
    return { ok: true, data: reaction };
  } catch (error) {
    logger.error("addReactionSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function removeReactionSvc(
  userId: string,
  messageId: string,
  emoji: string,
): Promise<ServerActionResult<{ removed: number }>> {
  try {
    EMOJI.parse(emoji);
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, workspaceId: true },
    });
    if (!message) return { ok: false, error: "message_not_found" };
    await requireMembership(message.workspaceId, userId);

    const result = await prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });
    return { ok: true, data: { removed: result.count } };
  } catch (error) {
    logger.error("removeReactionSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

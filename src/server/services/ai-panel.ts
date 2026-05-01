import "server-only";

import type { AiPanelMessage } from "@prisma/client";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import {
  type AiPanelPageContext,
  type AiToolExecutionResult,
  executeTool,
} from "@/server/services/ai-panel-tools";

export const AI_PANEL_MODEL = "anthropic/claude-sonnet-4";
export const AI_PANEL_MAX_BODY = 10_000;
export const AI_PANEL_HISTORY_LIMIT = 40;

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

function clip(body: string): string {
  return body.length > AI_PANEL_MAX_BODY ? body.slice(0, AI_PANEL_MAX_BODY) : body;
}

export async function getOrCreateConversationSvc(
  userId: string,
  workspaceId: string,
): Promise<ServerActionResult<{ id: string; messages: AiPanelMessage[] }>> {
  try {
    await requireMembership(workspaceId, userId);
    const conversation = await prisma.aiConversation.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId },
      update: {},
      select: { id: true },
    });
    const messages = await prisma.aiPanelMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: AI_PANEL_HISTORY_LIMIT,
    });
    return {
      ok: true,
      data: { id: conversation.id, messages: messages.reverse() },
    };
  } catch (error) {
    logger.error("getOrCreateConversationSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

async function loadConversationForUser(conversationId: string, userId: string) {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!conversation) return null;
  if (conversation.userId !== userId) return null;
  return conversation;
}

function emitMessageEvent(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string,
): void {
  void publishWorkspaceEvent(workspaceId, {
    name: "ai-panel.message.created",
    workspaceId,
    userId,
    conversationId,
    messageId,
  }).catch((error: unknown) => {
    logger.warn("ai-panel.publish.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function appendUserMessageSvc(args: {
  userId: string;
  conversationId: string;
  body: string;
  pageContext: AiPanelPageContext;
}): Promise<{ message: AiPanelMessage }> {
  const conversation = await loadConversationForUser(args.conversationId, args.userId);
  if (!conversation) throw new Error("forbidden");
  await requireMembership(conversation.workspaceId, args.userId);

  const message = await prisma.aiPanelMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      body: clip(args.body),
      pageContext: args.pageContext as unknown as object,
    },
  });
  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });
  emitMessageEvent(conversation.workspaceId, args.userId, conversation.id, message.id);
  return { message };
}

export type ToolCallToPersist = {
  name: string;
  args: object;
};

export async function appendAssistantMessageSvc(args: {
  conversationId: string;
  body: string;
  toolCalls?: ToolCallToPersist[];
}): Promise<{ assistant: AiPanelMessage; toolMessages: AiPanelMessage[] }> {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: args.conversationId },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!conversation) throw new Error("conversation_not_found");

  const assistant = await prisma.aiPanelMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      body: clip(args.body),
    },
  });
  emitMessageEvent(conversation.workspaceId, conversation.userId, conversation.id, assistant.id);

  const toolMessages: AiPanelMessage[] = [];
  if (args.toolCalls && args.toolCalls.length > 0) {
    for (const call of args.toolCalls) {
      const tm = await prisma.aiPanelMessage.create({
        data: {
          conversationId: conversation.id,
          role: "tool",
          body: "",
          toolName: call.name,
          toolArgs: call.args as unknown as object,
          toolStatus: "pending",
        },
      });
      toolMessages.push(tm);
      emitMessageEvent(conversation.workspaceId, conversation.userId, conversation.id, tm.id);
    }
  }

  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });
  return { assistant, toolMessages };
}

export async function confirmToolCallSvc(
  userId: string,
  args: { messageId: string; args: object },
): Promise<ServerActionResult<AiToolExecutionResult>> {
  try {
    const message = await prisma.aiPanelMessage.findUnique({
      where: { id: args.messageId },
      include: {
        conversation: {
          select: { id: true, userId: true, workspaceId: true },
        },
      },
    });
    if (!message) return { ok: false, error: "message_not_found" };
    if (message.role !== "tool") return { ok: false, error: "not_a_tool_call" };
    if (message.toolStatus !== "pending") return { ok: false, error: "not_pending" };
    if (message.conversation.userId !== userId) return { ok: false, error: "forbidden" };
    await requireMembership(message.conversation.workspaceId, userId);
    if (!message.toolName) return { ok: false, error: "no_tool_name" };

    const pageContext = ((message.pageContext as unknown as AiPanelPageContext | null) ?? {
      workspaceId: message.conversation.workspaceId,
    }) as AiPanelPageContext;

    const exec = await executeTool({
      userId,
      workspaceId: message.conversation.workspaceId,
      toolName: message.toolName,
      toolArgs: args.args,
      pageContext,
    });

    await prisma.aiPanelMessage.update({
      where: { id: message.id },
      data: {
        toolArgs: args.args as unknown as object,
        toolStatus: exec.ok ? "executed" : "failed",
        toolResult: (exec.ok
          ? { ok: true, ...exec.data }
          : { ok: false, error: exec.error }) as unknown as object,
      },
    });
    emitMessageEvent(message.conversation.workspaceId, userId, message.conversation.id, message.id);

    return exec;
  } catch (error) {
    logger.error("confirmToolCallSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function rejectToolCallSvc(
  userId: string,
  args: { messageId: string },
): Promise<ServerActionResult<null>> {
  try {
    const message = await prisma.aiPanelMessage.findUnique({
      where: { id: args.messageId },
      include: {
        conversation: { select: { id: true, userId: true, workspaceId: true } },
      },
    });
    if (!message) return { ok: false, error: "message_not_found" };
    if (message.role !== "tool") return { ok: false, error: "not_a_tool_call" };
    if (message.toolStatus !== "pending") return { ok: false, error: "not_pending" };
    if (message.conversation.userId !== userId) return { ok: false, error: "forbidden" };
    await requireMembership(message.conversation.workspaceId, userId);

    await prisma.aiPanelMessage.update({
      where: { id: message.id },
      data: { toolStatus: "rejected" },
    });
    emitMessageEvent(message.conversation.workspaceId, userId, message.conversation.id, message.id);
    return { ok: true, data: null };
  } catch (error) {
    logger.error("rejectToolCallSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

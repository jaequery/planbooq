"use server";

import type { AiPanelMessage } from "@prisma/client";
import { z } from "zod";
import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import {
  confirmToolCallSvc,
  getOrCreateConversationSvc,
  rejectToolCallSvc,
} from "@/server/services/ai-panel";
import type { AiToolExecutionResult } from "@/server/services/ai-panel-tools";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const GetOrCreateConversationSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function getOrCreateConversation(input: {
  workspaceId: string;
}): Promise<ServerActionResult<{ id: string; messages: AiPanelMessage[] }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = GetOrCreateConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return getOrCreateConversationSvc(userId, parsed.data.workspaceId);
}

const ConfirmToolCallSchema = z
  .object({ messageId: z.string().min(1), args: z.unknown() })
  .strict();

export async function confirmToolCall(input: {
  messageId: string;
  args: unknown;
}): Promise<ServerActionResult<AiToolExecutionResult>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = ConfirmToolCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const argsObject =
    typeof parsed.data.args === "object" && parsed.data.args !== null
      ? (parsed.data.args as object)
      : {};
  const result = await confirmToolCallSvc(userId, {
    messageId: parsed.data.messageId,
    args: argsObject,
  });
  return result;
}

const RejectToolCallSchema = z.object({ messageId: z.string().min(1) }).strict();

export async function rejectToolCall(input: {
  messageId: string;
}): Promise<ServerActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = RejectToolCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return rejectToolCallSvc(userId, { messageId: parsed.data.messageId });
}

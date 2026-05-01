"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";
import {
  type AiMessage,
  listTicketAiMessagesSvc,
  recordAiSystemMessageSvc,
  sendAiMessageSvc,
} from "@/server/services/ai-chat";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function listTicketAiMessages(
  ticketId: string,
): Promise<ServerActionResult<{ items: AiMessage[] }>> {
  try {
    const userId = await requireUserId();
    return await listTicketAiMessagesSvc(userId, ticketId);
  } catch (error) {
    logger.error("listTicketAiMessages.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function sendTicketAiMessage(input: {
  ticketId: string;
  body: string;
}): Promise<
  ServerActionResult<{ user: AiMessage; assistant: AiMessage | null; assistantError?: string }>
> {
  try {
    const userId = await requireUserId();
    const result = await sendAiMessageSvc(userId, input);
    if (result.ok) revalidatePath("/");
    return result;
  } catch (error) {
    logger.error("sendTicketAiMessage.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function runTicketAiCodeAgent(
  ticketId: string,
): Promise<ServerActionResult<{ message: AiMessage }>> {
  try {
    const userId = await requireUserId();
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    const member = await prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId: ticket.workspaceId, userId } },
    });
    if (!member) return { ok: false, error: "forbidden" };

    const message = await recordAiSystemMessageSvc({
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      body: "Code-change agent run requested. Worker will create a ticket-scoped branch and report back here when finished.",
      kind: "code-run-start",
    });

    await inngest.send({
      name: "ticket/ai-code-run.requested",
      data: { ticketId: ticket.id, workspaceId: ticket.workspaceId, requestedBy: userId },
    });

    return { ok: true, data: { message } };
  } catch (error) {
    logger.error("runTicketAiCodeAgent.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

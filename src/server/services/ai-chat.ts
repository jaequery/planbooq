import "server-only";

import type { TicketAiMessage } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { getOpenRouterApiKey } from "@/server/openrouter";

export type AiMessage = TicketAiMessage;

const MAX_BODY = 10_000;
const HISTORY_LIMIT = 40;
const MODEL = "openrouter/auto";

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

async function loadTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      title: true,
      description: true,
      archivedAt: true,
    },
  });
  return ticket;
}

export async function listTicketAiMessagesSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<{ items: AiMessage[] }>> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "ticket_not_found" };
  try {
    await requireMembership(ticket.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const items = await prisma.ticketAiMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });
  return { ok: true, data: { items } };
}

export const SendAiMessageSchema = z
  .object({ ticketId: z.string().min(1), body: z.string().min(1).max(MAX_BODY) })
  .strict();

type SendResult = { user: AiMessage; assistant: AiMessage | null; assistantError?: string };

export async function sendAiMessageSvc(
  userId: string,
  input: z.infer<typeof SendAiMessageSchema>,
): Promise<ServerActionResult<SendResult>> {
  try {
    const data = SendAiMessageSchema.parse(input);
    const ticket = await loadTicket(data.ticketId);
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };
    await requireMembership(ticket.workspaceId, userId);

    const userMessage = await prisma.ticketAiMessage.create({
      data: {
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
        role: "user",
        body: data.body,
        authorId: userId,
        kind: "chat",
      },
    });
    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ai.message.created",
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      ticketId: ticket.id,
      message: userMessage,
      by: userId,
    });

    const apiKey = await getOpenRouterApiKey(ticket.workspaceId);
    if (!apiKey) {
      return { ok: true, data: { user: userMessage, assistant: null, assistantError: "no_key" } };
    }

    const history = await prisma.ticketAiMessage.findMany({
      where: { ticketId: ticket.id, kind: "chat" },
      orderBy: { createdAt: "asc" },
      take: HISTORY_LIMIT,
    });

    const systemPrompt = ticket.description
      ? `You are a software engineering assistant pairing on a Planbooq ticket.\n\nTicket: ${ticket.title}\n\n${ticket.description}\n\nReply concisely. Suggest concrete code changes when useful; the user can run them via the "Run agent" button.`
      : `You are a software engineering assistant pairing on a Planbooq ticket "${ticket.title}". Reply concisely.`;

    const replyText = await callOpenRouter(apiKey, systemPrompt, history);
    if (!replyText.ok) {
      return {
        ok: true,
        data: { user: userMessage, assistant: null, assistantError: replyText.error },
      };
    }

    const assistantMessage = await prisma.ticketAiMessage.create({
      data: {
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
        role: "assistant",
        body: replyText.reply.slice(0, MAX_BODY),
        kind: "chat",
      },
    });
    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ai.message.created",
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
      ticketId: ticket.id,
      message: assistantMessage,
      by: userId,
    });

    return { ok: true, data: { user: userMessage, assistant: assistantMessage } };
  } catch (error) {
    logger.error("sendAiMessageSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function recordAiSystemMessageSvc(args: {
  ticketId: string;
  workspaceId: string;
  body: string;
  kind: "code-run-start" | "code-run-result";
}): Promise<AiMessage> {
  const message = await prisma.ticketAiMessage.create({
    data: {
      ticketId: args.ticketId,
      workspaceId: args.workspaceId,
      role: "system",
      body: args.body.slice(0, MAX_BODY),
      kind: args.kind,
    },
  });
  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: { projectId: true },
  });
  await publishWorkspaceEvent(args.workspaceId, {
    name: "ai.message.created",
    workspaceId: args.workspaceId,
    projectId: ticket?.projectId ?? "",
    ticketId: args.ticketId,
    message,
    by: "system",
  });
  return message;
}

type OpenRouterReply = { ok: true; reply: string } | { ok: false; error: string };

async function callOpenRouter(
  apiKey: string,
  systemPrompt: string,
  history: AiMessage[],
): Promise<OpenRouterReply> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.body });
    }
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Planbooq",
      },
      body: JSON.stringify({ model: MODEL, messages }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `openrouter_${res.status}:${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: "empty_reply" };
    return { ok: true, reply };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

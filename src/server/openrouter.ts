import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

export const OPENROUTER_KEY_PREFIX = "sk-or-";

export function isValidOpenRouterKeyShape(key: string): boolean {
  return key.startsWith(OPENROUTER_KEY_PREFIX) && key.length >= 20;
}

export async function getOpenRouterApiKey(workspaceId: string): Promise<string | null> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { openrouterKeyCiphertext: true },
  });
  if (!ws?.openrouterKeyCiphertext) return null;
  return decryptSecret(ws.openrouterKeyCiphertext);
}

type OpenRouterRunResult = { ok: true; reply: string } | { ok: false; error: string };

export async function runOpenRouterForTicket(args: {
  ticketId: string;
  workspaceId: string;
  title: string;
  description: string | null;
}): Promise<OpenRouterRunResult> {
  const apiKey = await getOpenRouterApiKey(args.workspaceId);
  if (!apiKey) return { ok: false, error: "no_key" };

  const prompt = args.description ? `Title: ${args.title}\n\n${args.description}` : args.title;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Planbooq",
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [
          {
            role: "system",
            content:
              "You are a software engineering assistant working a Planbooq ticket. Reply with a brief plan only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `openrouter_${res.status}:${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content ?? "";
    logger.info("openrouter.ticket.executed", {
      ticketId: args.ticketId,
      workspaceId: args.workspaceId,
      replyChars: reply.length,
    });
    return { ok: true, reply };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

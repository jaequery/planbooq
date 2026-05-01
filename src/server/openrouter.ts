import "server-only";
import { logger } from "@/lib/logger";

const DEFAULT_MODEL = "anthropic/claude-opus-4.7";

export function getOpenRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

type OpenRouterRunResult = { ok: true; reply: string } | { ok: false; error: string };

export async function runOpenRouterForTicket(args: {
  ticketId: string;
  workspaceId: string;
  title: string;
  description: string | null;
}): Promise<OpenRouterRunResult> {
  const apiKey = getOpenRouterApiKey();
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
        model: getOpenRouterModel(),
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

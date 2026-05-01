import "server-only";
import { logger } from "@/lib/logger";

type OpenRouterRunResult = { ok: true; reply: string } | { ok: false; error: string };

export async function runOpenRouterForTicket(args: {
  ticketId: string;
  workspaceId: string;
  title: string;
  description: string | null;
}): Promise<OpenRouterRunResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
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

type TicketDraft = { title: string; description: string };
type DraftResult = { ok: true; draft: TicketDraft } | { ok: false; error: string };

function fallbackDraftFromPrompt(prompt: string): TicketDraft {
  const firstLine = prompt.trim().split("\n")[0]?.trim() ?? prompt.trim();
  const title = firstLine.slice(0, 200) || "Untitled ticket";
  const description = prompt.trim().slice(0, 5000);
  return { title, description };
}

function parseDraftJson(content: string): TicketDraft | null {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const obj = JSON.parse(stripped) as Partial<TicketDraft>;
    if (typeof obj.title !== "string") return null;
    return {
      title: obj.title,
      description: typeof obj.description === "string" ? obj.description : "",
    };
  } catch {
    return null;
  }
}

export async function generateTicketDraft(args: {
  workspaceId: string;
  prompt: string;
}): Promise<DraftResult> {
  const apiKey = await getOpenRouterApiKey(args.workspaceId);
  if (!apiKey) return { ok: false, error: "no_key" };

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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You convert a user request into a Planbooq kanban ticket. Reply with strict JSON only: {"title": string up to 120 chars, "description": markdown string up to 4000 chars}. Title is a concise imperative summary. Description expands on scope and acceptance criteria when the prompt is rich; keep it brief when the prompt is terse. No surrounding prose, no code fences.',
          },
          { role: "user", content: args.prompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("openrouter.draft.failed", {
        status: res.status,
        body: text.slice(0, 200),
      });
      return { ok: false, error: `openrouter_${res.status}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return { ok: true, draft: fallbackDraftFromPrompt(args.prompt) };

    const parsed = parseDraftJson(content);
    if (!parsed) {
      logger.warn("openrouter.draft.unparseable", { sample: content.slice(0, 200) });
      return { ok: true, draft: fallbackDraftFromPrompt(args.prompt) };
    }

    const title = parsed.title.trim().slice(0, 200) || fallbackDraftFromPrompt(args.prompt).title;
    const description = parsed.description.trim().slice(0, 5000);
    return { ok: true, draft: { title, description } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

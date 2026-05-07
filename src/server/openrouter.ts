import "server-only";
import { logger } from "@/lib/logger";

/**
 * Resolves the OpenRouter API key for a workspace. Today this only consults
 * the process env (BYOK per-workspace storage is TBD). Accepts workspaceId
 * for forwards-compatibility.
 */
export async function getOpenRouterApiKey(_workspaceId: string): Promise<string | null> {
  return process.env.OPENROUTER_API_KEY ?? null;
}

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

type PlanResult = { ok: true; content: string; model: string } | { ok: false; error: string };

export async function generateTicketPlan(args: {
  workspaceId: string;
  title: string;
  description: string | null;
  projectContext?: string | null;
}): Promise<PlanResult> {
  const apiKey = await getOpenRouterApiKey(args.workspaceId);
  if (!apiKey) return { ok: false, error: "no_key" };

  const userPrompt = [
    args.projectContext ? `Project context:\n${args.projectContext}` : null,
    `Ticket title: ${args.title}`,
    args.description ? `Ticket description:\n${args.description}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = "openrouter/auto";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Planbooq",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a senior engineer turning a kanban ticket into a concrete implementation plan for a coding agent. Reply in markdown. Sections: ## Goal, ## Approach, ## Files to change, ## Acceptance criteria. Be specific but concise. No preamble, no closing remarks.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `openrouter_${res.status}:${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return { ok: false, error: "empty_plan" };
    return { ok: true, content, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

type StatusChoice = { ok: true; statusKey: string; reason: string } | { ok: false; error: string };

/**
 * Pick the best target status for a ticket whose workflow run has just been
 * triggered. The choice is made by an LLM given the ticket, the workflow
 * steps about to run, and the available status keys for the workspace.
 *
 * Best-effort. Callers should fall back to a deterministic rule when this
 * returns `{ ok: false }` (no key configured, network blip, unparseable).
 */
export async function chooseStatusForWorkflowRun(args: {
  workspaceId: string;
  ticket: { title: string; description: string | null };
  currentStatusKey: string;
  steps: Array<{ name: string; prompt: string }>;
  availableStatuses: Array<{ key: string; name: string }>;
}): Promise<StatusChoice> {
  const apiKey = await getOpenRouterApiKey(args.workspaceId);
  if (!apiKey) return { ok: false, error: "no_key" };

  const allowed = args.availableStatuses.map((s) => s.key);
  const userPrompt = [
    `Ticket title: ${args.ticket.title}`,
    args.ticket.description ? `Ticket description:\n${args.ticket.description}` : null,
    `Current status: ${args.currentStatusKey}`,
    `Available statuses: ${args.availableStatuses
      .map((s) => `${s.key} (${s.name})`)
      .join(", ")}`,
    `Workflow steps about to run:\n${args.steps
      .map((s, i) => `${i + 1}. ${s.name}\n   ${s.prompt.slice(0, 400)}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

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
              'You decide which kanban status best reflects the work happening on a ticket whose workflow steps are about to execute via Claude Code. Common keys: backlog (not started), todo (planned), building (work in progress), review (PR open / awaiting human check), completed (merged/done). Pick the single status that best describes the state the ticket should be in *while these steps run*. If steps clearly produce a PR / final review artifact, prefer "review" over "building". If the ticket is already in a later status (e.g. completed) and a re-run is starting fresh work, move it back to "building". Reply with strict JSON only: {"statusKey": one of the allowed keys, "reason": short string}. No prose, no fences.',
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `openrouter_${res.status}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return { ok: false, error: "empty" };
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    let parsed: { statusKey?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(stripped) as { statusKey?: unknown; reason?: unknown };
    } catch {
      return { ok: false, error: "unparseable" };
    }
    const key = typeof parsed.statusKey === "string" ? parsed.statusKey : "";
    if (!allowed.includes(key)) return { ok: false, error: "invalid_key" };
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "";
    logger.info("openrouter.status.chosen", {
      workspaceId: args.workspaceId,
      from: args.currentStatusKey,
      to: key,
      reason,
    });
    return { ok: true, statusKey: key, reason };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
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

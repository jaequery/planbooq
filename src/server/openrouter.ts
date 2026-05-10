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

type TicketDraft = { title: string; description: string; plan: string };
type DraftResult = { ok: true; draft: TicketDraft } | { ok: false; error: string };

function fallbackDraftFromPrompt(prompt: string): TicketDraft {
  const firstLine = prompt.trim().split("\n")[0]?.trim() ?? prompt.trim();
  const title = firstLine.slice(0, 200) || "Untitled ticket";
  const description = prompt.trim().slice(0, 5000);
  return { title, description, plan: "" };
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
      plan: typeof obj.plan === "string" ? obj.plan : "",
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
        model: "anthropic/claude-haiku-4.5",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You convert a user request into a Planbooq kanban ticket. Reply with strict JSON only: {"title": string up to 120 chars, "description": markdown string up to 2000 chars, "plan": markdown string up to 4000 chars}. Title is a concise imperative summary. Description is a brief summary of the user\'s ask and acceptance criteria — NOT a plan. Plan is the engineering implementation plan (sections like Goal, Approach, Files to change, Acceptance criteria) when the prompt has enough detail to plan; otherwise an empty string. Never put plan content into description. No surrounding prose, no code fences.',
          },
          { role: "user", content: args.prompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
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
    const plan = parsed.plan.trim().slice(0, 20000);
    return { ok: true, draft: { title, description, plan } };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: "openrouter_timeout" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NO_PRIORITY";
type PriorityResult =
  | { ok: true; priority: Priority; reason: string; source: "llm" | "heuristic" }
  | { ok: false; error: string };

const URGENT_KEYWORDS = [
  "urgent",
  "asap",
  "critical",
  "p0",
  "outage",
  "production down",
  "prod down",
  "data loss",
  "security",
  "vulnerability",
  "exploit",
  "breach",
  "regression",
  "crash",
];
const HIGH_KEYWORDS = [
  "important",
  "p1",
  "blocker",
  "blocking",
  "deadline",
  "ship",
  "launch",
  "bug",
  "fix",
  "broken",
  "fails",
  "failing",
  "perf",
  "slow",
  "timeout",
];
const LOW_KEYWORDS = [
  "nice to have",
  "nice-to-have",
  "someday",
  "polish",
  "minor",
  "typo",
  "cleanup",
  "cosmetic",
  "tweak",
  "p3",
  "p4",
  "later",
  "wishlist",
];

export function heuristicPriority(args: { title: string; description: string | null }): {
  priority: Priority;
  reason: string;
} {
  const haystack = `${args.title}\n${args.description ?? ""}`.toLowerCase();
  const has = (kws: string[]) => kws.find((k) => haystack.includes(k));
  const u = has(URGENT_KEYWORDS);
  if (u) return { priority: "URGENT", reason: `matched urgent signal "${u}"` };
  const h = has(HIGH_KEYWORDS);
  if (h) return { priority: "HIGH", reason: `matched high signal "${h}"` };
  const l = has(LOW_KEYWORDS);
  if (l) return { priority: "LOW", reason: `matched low signal "${l}"` };
  return { priority: "MEDIUM", reason: "no strong signals — defaulted to medium" };
}

function parsePriorityJson(content: string): { priority: Priority; reason: string } | null {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const obj = JSON.parse(stripped) as { priority?: unknown; reason?: unknown };
    const p = typeof obj.priority === "string" ? obj.priority.toUpperCase() : "";
    const valid: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NO_PRIORITY"];
    if (!valid.includes(p as Priority)) return null;
    return {
      priority: p as Priority,
      reason: typeof obj.reason === "string" ? obj.reason.slice(0, 280) : "",
    };
  } catch {
    return null;
  }
}

export async function inferTicketPriority(args: {
  workspaceId: string;
  title: string;
  description: string | null;
  projectContext?: string | null;
}): Promise<PriorityResult> {
  const apiKey = await getOpenRouterApiKey(args.workspaceId);
  if (!apiKey) {
    const h = heuristicPriority({ title: args.title, description: args.description });
    return { ok: true, priority: h.priority, reason: h.reason, source: "heuristic" };
  }

  const userPrompt = [
    args.projectContext ? `Project context:\n${args.projectContext}` : null,
    `Ticket title: ${args.title}`,
    args.description ? `Ticket description:\n${args.description}` : null,
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
        model: "anthropic/claude-haiku-4.5",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You assign a priority level to a kanban ticket given its title, description, and project context. Reply with strict JSON only: {"priority": "URGENT"|"HIGH"|"MEDIUM"|"LOW", "reason": string up to 200 chars}. Rubric: URGENT = production outage, security vulnerability, data loss, blocking active customer. HIGH = bug affecting users, blocker for upcoming work, important feature on the roadmap. MEDIUM = normal feature work, improvements, refactors. LOW = polish, nice-to-haves, minor cleanup, cosmetic. Lean MEDIUM when uncertain. No surrounding prose, no code fences.',
          },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("openrouter.priority.failed", { status: res.status, body: text.slice(0, 200) });
      const h = heuristicPriority({ title: args.title, description: args.description });
      return { ok: true, priority: h.priority, reason: h.reason, source: "heuristic" };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parsePriorityJson(content);
    if (!parsed) {
      logger.warn("openrouter.priority.unparseable", { sample: content.slice(0, 200) });
      const h = heuristicPriority({ title: args.title, description: args.description });
      return { ok: true, priority: h.priority, reason: h.reason, source: "heuristic" };
    }
    return { ok: true, priority: parsed.priority, reason: parsed.reason, source: "llm" };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      const h = heuristicPriority({ title: args.title, description: args.description });
      return { ok: true, priority: h.priority, reason: h.reason, source: "heuristic" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

type AgentProfileDraft = { name: string; description: string; body: string };
type AgentProfileDraftResult =
  | { ok: true; draft: AgentProfileDraft }
  | { ok: false; error: string };

function parseAgentDraftJson(content: string): AgentProfileDraft | null {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const obj = JSON.parse(stripped) as Partial<AgentProfileDraft>;
    if (typeof obj.name !== "string" || typeof obj.body !== "string") return null;
    return {
      name: obj.name,
      description: typeof obj.description === "string" ? obj.description : "",
      body: obj.body,
    };
  } catch {
    return null;
  }
}

export async function generateAgentProfileDraft(args: {
  workspaceId: string;
  prompt: string;
}): Promise<AgentProfileDraftResult> {
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
        model: "anthropic/claude-haiku-4.5",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You design AGENTS.md-style personas for AI coding workers in Planbooq. Reply with strict JSON only: {"name": string up to 80 chars, "description": string up to 280 chars, "body": markdown string up to 8000 chars}. Name is a short title like "Senior frontend" or "API security reviewer". Description is a one-line summary of expertise. Body is a markdown persona prompt with sections like "# Role", "# Expertise", "# Conventions", "# Constraints" — concise, instructional, written as a system prompt the worker will receive. No surrounding prose, no code fences.',
          },
          { role: "user", content: args.prompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("openrouter.agentDraft.failed", {
        status: res.status,
        body: text.slice(0, 200),
      });
      return { ok: false, error: `openrouter_${res.status}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return { ok: false, error: "empty_draft" };

    const parsed = parseAgentDraftJson(content);
    if (!parsed) {
      logger.warn("openrouter.agentDraft.unparseable", { sample: content.slice(0, 200) });
      return { ok: false, error: "unparseable" };
    }

    const name = parsed.name.trim().slice(0, 80);
    const description = parsed.description.trim().slice(0, 280);
    const body = parsed.body.trim().slice(0, 50_000);
    if (!name || !body) return { ok: false, error: "incomplete_draft" };
    return { ok: true, draft: { name, description, body } };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: "openrouter_timeout" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export type ProjectDocKey = "claude" | "agent" | "readme";

type DocResult = { ok: true; content: string; model: string } | { ok: false; error: string };

const DOC_SYSTEM_PROMPTS: Record<ProjectDocKey, string> = {
  claude:
    "You are generating a CLAUDE.md file for a software project. CLAUDE.md is a guidance document read by Claude Code (claude.ai/code) when working in the repo. Output GitHub-flavored markdown only — no preamble, no code fences around the whole document. Use these sections when applicable: # CLAUDE.md (with a one-line description), ## Project (what it is and core concepts), ## Tech Stack, ## Commands (dev/build/test/lint), ## Architecture (key directories, data flow, mutation patterns). Be concrete and specific to the supplied project context. Prefer terse, scannable bullets over prose.",
  agent:
    "You are generating an AGENT.md file for a software project. AGENT.md is the cross-tool convention for AI coding agents (Cursor, Codex, Aider, etc.) that mirrors CLAUDE.md but is tool-agnostic. Output GitHub-flavored markdown only — no preamble, no code fences around the whole document. Suggested sections: # AGENT.md, ## Project, ## Tech Stack, ## Commands, ## Conventions, ## Architecture. Be concrete and specific to the supplied project context. Prefer terse, scannable bullets over prose.",
  readme:
    "You are generating a README.md file for a software project. Output GitHub-flavored markdown only — no preamble, no code fences around the whole document. Suggested sections: # <Project Name>, a one-line tagline, ## Overview, ## Features, ## Getting Started (install + run), ## Tech Stack, ## Project Structure, ## License placeholder. Tone: clear, professional, welcoming to new contributors. Be specific to the supplied project context.",
};

export async function generateProjectDoc(args: {
  workspaceId: string;
  docKey: ProjectDocKey;
  projectName: string;
  projectContext: string | null;
  existing: string | null;
}): Promise<DocResult> {
  const apiKey = await getOpenRouterApiKey(args.workspaceId);
  if (!apiKey) return { ok: false, error: "no_key" };

  const trimmedExisting = args.existing?.trim() ?? "";
  const mode = trimmedExisting.length > 0 ? "improve" : "create";

  const userPrompt = [
    `Project name: ${args.projectName}`,
    args.projectContext ? `Project context:\n${args.projectContext}` : null,
    mode === "improve"
      ? `Existing document (improve, restructure, and expand it — preserve accurate facts, fix gaps, keep the user's voice):\n\n${trimmedExisting.slice(0, 12000)}`
      : "No existing document. Generate a fresh draft from the project context above.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = "anthropic/claude-haiku-4.5";
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
          { role: "system", content: DOC_SYSTEM_PROMPTS[args.docKey] },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `openrouter_${res.status}:${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let content = data.choices?.[0]?.message?.content?.trim() ?? "";
    // Strip a single wrapping ```markdown ... ``` fence if the model added one.
    const fence = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fence?.[1]) content = fence[1].trim();
    if (!content) return { ok: false, error: "empty_doc" };
    logger.info("openrouter.projectDoc.generated", {
      workspaceId: args.workspaceId,
      docKey: args.docKey,
      mode,
      chars: content.length,
    });
    return { ok: true, content, model };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: "openrouter_timeout" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

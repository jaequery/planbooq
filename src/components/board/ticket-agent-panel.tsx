"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Folder, Loader2, Play, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { dispatchTicketToAgent, listAgents } from "@/actions/agents";
import { mintAgentApiKey } from "@/actions/api-keys";
import { getProjectLocalPath, updateProject } from "@/actions/project";
import {
  applyWorkflowStatusSuggestion,
  decideEndOfRunStatus,
  getTicketWorkflow,
  getWorkflowStatusContext,
  logWorkflowActivity,
} from "@/actions/workflow";
import { TicketWorkflowPanel } from "@/components/board/ticket-workflow-panel";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import {
  getAgentSessionByTicket,
  markSessionStoppedByUser,
  registerAgentSession,
  unregisterAgentSession,
} from "@/lib/agent-session-manager";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent, MessageEventPayload } from "@/lib/types";
import { type AgentEvent, getDesktopBridge, useIsDesktop } from "@/lib/use-is-desktop";

type Job = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  output: string;
  exitCode: number | null;
  error: string | null;
  createdAt: string;
  agent: { id: string; name: string; hostname: string | null } | null;
};

type Agent = { id: string; name: string; hostname: string | null; revokedAt: Date | null };

type Props = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  identifier: string;
  statusKey?: string;
  autoRunAction?: boolean;
};

export function TicketAgentPanel(props: Props): React.ReactElement {
  const isDesktop = useIsDesktop();
  return (
    <div className="flex flex-col gap-2">
      <TicketWorkflowPanel
        ticketId={props.ticketId}
        workspaceId={props.workspaceId}
        projectId={props.projectId}
      />
      {isDesktop ? <DesktopPanel {...props} /> : <WebPanel {...props} />}
    </div>
  );
}

type ChatMsg =
  | { id: string; role: "user"; text: string; createdAt: number }
  | { id: string; role: "assistant"; text: string; createdAt: number }
  | { id: string; role: "system"; text: string; createdAt: number };

type AssistantBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
};
type StreamDelta = { type?: string; text?: string };
type StreamInner = {
  type?: string;
  delta?: StreamDelta;
  content_block?: { type?: string; text?: string };
};
type ParsedEvent = {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: string;
  error?: string;
  message?: { content?: AssistantBlock[] };
  event?: StreamInner;
};

type WireEvent =
  | { kind: "agent"; line: string; at?: number }
  | { kind: "stderr"; line: string; at?: number }
  | { kind: "exit"; code: number; at?: number }
  | { kind: "user"; text: string; at?: number };

function formatToolUse(name: string, input: Record<string, unknown> | undefined): string {
  const arg = (() => {
    if (!input) return "";
    const i = input as Record<string, unknown>;
    const pick = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : "");
    switch (name) {
      case "Bash":
        return pick("command");
      case "Read":
      case "Write":
      case "Edit":
      case "NotebookEdit":
        return pick("file_path");
      case "Glob":
        return pick("pattern");
      case "Grep":
        return pick("pattern");
      case "WebFetch":
      case "WebSearch":
        return pick("url") || pick("query");
      case "Task":
        return pick("description");
      default: {
        const first = Object.values(i).find((v) => typeof v === "string") as string | undefined;
        return first ?? "";
      }
    }
  })();
  const shortened = arg.replace(
    /\/[^\s"']*?\/(?=src\/|app\/|prisma\/|public\/|docs\/|scripts\/|\.planning\/)/g,
    "",
  );
  const trimmed = shortened.replace(/\s+/g, " ").trim();
  const clipped = trimmed.length > 160 ? `${trimmed.slice(0, 159)}…` : trimmed;
  return clipped ? `→ ${name}: ${clipped}` : `→ ${name}`;
}

/**
 * Applies a single wire-format event to a message list, mutating
 * currentAssistantIdRef to track which assistant bubble is being streamed
 * into. Used by both live event handler and the on-mount replay path so
 * the rendering logic stays identical.
 */
function applyWireEvent(
  ev: WireEvent,
  msgs: ChatMsg[],
  currentAssistantIdRef: { current: string | null },
): {
  msgs: ChatMsg[];
  claudeSessionId?: string | null;
  ended?: boolean;
  errorEnd?: { subtype?: string; summary: string };
} {
  const at = ev.at ?? Date.now();
  if (ev.kind === "user") {
    return {
      msgs: [...msgs, { id: crypto.randomUUID(), role: "user", text: ev.text, createdAt: at }],
    };
  }
  if (ev.kind === "exit") {
    currentAssistantIdRef.current = null;
    return {
      msgs: [
        ...msgs,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `Session ended (exit ${ev.code})`,
          createdAt: at,
        },
      ],
      ended: true,
    };
  }
  if (ev.kind === "stderr") {
    if (/error|fatal|fail/i.test(ev.line)) {
      return {
        msgs: [
          ...msgs,
          {
            id: crypto.randomUUID(),
            role: "system",
            text: ev.line.trim(),
            createdAt: at,
          },
        ],
      };
    }
    return { msgs };
  }
  // ev.kind === "agent"
  let parsed: ParsedEvent | null = null;
  try {
    parsed = JSON.parse(ev.line) as ParsedEvent;
  } catch {
    return { msgs };
  }
  const append = (text: string, replace = false): ChatMsg[] => {
    if (!text) return msgs;
    const id = currentAssistantIdRef.current;
    if (id && msgs.length > 0 && msgs[msgs.length - 1]!.id === id) {
      const next = msgs.slice();
      const last = next[next.length - 1]!;
      next[next.length - 1] = {
        ...last,
        text: replace ? text : last.text + text,
      } as ChatMsg;
      return next;
    }
    const newId = crypto.randomUUID();
    currentAssistantIdRef.current = newId;
    return [...msgs, { id: newId, role: "assistant", text, createdAt: at }];
  };

  if (parsed.type === "stream_event" && parsed.event) {
    const inner = parsed.event;
    if (inner.type === "content_block_delta" && inner.delta?.type === "text_delta") {
      return { msgs: append(inner.delta.text ?? "") };
    }
    if (inner.type === "content_block_start" && inner.content_block?.type === "text") {
      if (inner.content_block.text) return { msgs: append(inner.content_block.text) };
      return { msgs };
    }
    if (inner.type === "message_stop") {
      currentAssistantIdRef.current = null;
      return { msgs };
    }
    return { msgs };
  }
  if (parsed.type === "assistant" && parsed.message) {
    const blocks: AssistantBlock[] = parsed.message.content ?? [];
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    let nextMsgs = msgs;
    if (text) {
      nextMsgs = append(text, currentAssistantIdRef.current !== null);
    }
    const toolLines = blocks
      .filter((b) => b.type === "tool_use" && typeof b.name === "string")
      .map((b) => formatToolUse(b.name as string, b.input));
    if (toolLines.length > 0) {
      currentAssistantIdRef.current = null;
      nextMsgs = [
        ...nextMsgs,
        ...toolLines.map((line) => ({
          id: crypto.randomUUID(),
          role: "system" as const,
          text: line,
          createdAt: at,
        })),
      ];
    }
    return { msgs: nextMsgs };
  }
  if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
    return { msgs, claudeSessionId: parsed.session_id };
  }
  if (parsed.type === "result") {
    currentAssistantIdRef.current = null;
    const isError =
      parsed.is_error === true ||
      (typeof parsed.subtype === "string" && /^error/i.test(parsed.subtype));
    if (isError) {
      // Pick the best human-readable summary the SDK gave us. Falls back to
      // the most recent assistant text — that's usually where the error
      // surfaced (e.g. "API Error: 400 Could not process image").
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      const summary =
        (typeof parsed.error === "string" && parsed.error.trim()) ||
        (typeof parsed.result === "string" && parsed.result.trim()) ||
        (lastAssistant ? lastAssistant.text.slice(-300) : "") ||
        parsed.subtype ||
        "Run failed";
      return {
        msgs,
        ended: true,
        errorEnd: { subtype: parsed.subtype, summary },
      };
    }
    return { msgs, ended: true };
  }
  return { msgs };
}

// Heuristic: does this assistant message look like Claude is waiting on the
// user to take action? Used to flip the ticket into "Blocked" so a human
// scanning the board can see at a glance that the agent is parked on a
// question. We deliberately bias toward false positives — moving a ticket to
// Blocked when the agent is actually done is a small cost; missing a real
// "I need you to decide" moment is what this feature exists to fix.
function looksLikeAwaitingUser(text: string): boolean {
  if (!text) return false;
  // Strip fenced code blocks so a trailing "?" inside code doesn't trigger.
  const stripped = text.replace(/```[\s\S]*?```/g, "").trim();
  if (!stripped) return false;
  // Widen the window — agents often pose a question, list options, then close
  // with a declarative "Default is A unless you say otherwise." footer.
  const tail = stripped.slice(-1200);
  if (/\?/.test(tail)) return true;
  return /\b(should i|would you like|do you want|let me know|please (confirm|advise|clarify|provide|let me know|choose|pick|decide)|which (one|option|approach|do you)|need (your|you to) (input|confirmation|approval|decision|answer)|waiting (on|for) you|ready for you to|confirm( |\?|$)|approve( |\?|$)|default is\b[^.]*\bunless\b|unless you (say|tell|specify|prefer|want|choose)|say otherwise|tell me which|pick (one|a|an option))/i.test(
    tail,
  );
}

// Walk a chunk of outgoing user text for /api/attachments/<id> URLs, fetch the
// bytes via the browser session (which has cookie auth), and ask the desktop
// bridge to write them under <worktree>/.planbooq/attachments/<id>.<ext> so
// the Claude subprocess can `Read` them as plain files instead of curling an
// auth-protected HTTP URL. Returns the message with each URL rewritten to its
// local relative path. Falls back to the original text on any failure — the
// agent will see the raw URL and surface a clear error rather than silently
// poisoning its session with garbage bytes.
async function materializeAttachmentsAndRewrite(
  text: string,
  worktreePath: string | null,
): Promise<{
  text: string;
  items: Array<{ id: string; ext: string; base64: string }>;
}> {
  const re = /\/api\/attachments\/([a-z0-9_-]+)/gi;
  const ids = Array.from(
    new Set(
      Array.from(text.matchAll(re), (m) => m[1]).filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      ),
    ),
  );
  if (ids.length === 0) return { text, items: [] };

  const items: Array<{ id: string; ext: string; base64: string }> = [];
  for (const id of ids) {
    try {
      const r = await fetch(`/api/attachments/${id}`);
      if (!r.ok) continue;
      const ct = (r.headers.get("content-type") ?? "").toLowerCase();
      const ext = ct.includes("png")
        ? "png"
        : ct.includes("jpeg") || ct.includes("jpg")
          ? "jpg"
          : ct.includes("gif")
            ? "gif"
            : ct.includes("webp")
              ? "webp"
              : ct.includes("svg")
                ? "svg"
                : "bin";
      const buf = new Uint8Array(await r.arrayBuffer());
      // btoa(String.fromCharCode(...)) blows the call-stack on large buffers;
      // chunk through 32KB windows to keep arg counts safe.
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      items.push({ id, ext, base64: btoa(bin) });
    } catch {
      // skip — agent will surface the missing attachment normally.
    }
  }

  if (items.length === 0) return { text, items: [] };

  // If we already have a worktree, write now so the agent sees real files
  // even if the cold-start path doesn't get to do it (mid-session sends).
  // Cold start passes items={items} to bridge.agentStart and that path
  // performs the same rewrite server-side after the worktree exists.
  let rewritten = text;
  if (worktreePath) {
    const bridge = getDesktopBridge();
    const w = await bridge?.writeAttachments?.({ worktreePath, items });
    if (w?.ok) {
      for (const it of w.items) {
        const re2 = new RegExp(`/api/attachments/${it.id}\\b`, "g");
        rewritten = rewritten.replace(re2, `./${it.relPath}`);
      }
    }
  } else {
    // No worktree yet — pre-rewrite to the conventional location the bridge
    // will use. agent:start IPC will mirror this rewrite after creating the
    // worktree, so the on-disk paths line up either way.
    for (const it of items) {
      const re2 = new RegExp(`/api/attachments/${it.id}\\b`, "g");
      rewritten = rewritten.replace(re2, `./.planbooq/attachments/${it.id}.${it.ext}`);
    }
  }
  return { text: rewritten, items };
}

function serializeWire(ev: WireEvent): string {
  const stamped = ev.at ? ev : { ...ev, at: Date.now() };
  return `${JSON.stringify(stamped)}\n`;
}

/**
 * Compact summary used for completed assistant messages: strips fenced code
 * blocks, then returns the first sentence(s) up to maxChars. Lets a long
 * agent reply collapse into a one-glance summary with an expand affordance.
 */
function summarizeAssistant(text: string, maxChars = 200): string {
  const stripped = text.replace(/```[\s\S]*?```/g, " ").trim();
  if (!stripped) return text.trim();
  const firstParaEnd = stripped.search(/\n\n/);
  const head = (firstParaEnd > 0 ? stripped.slice(0, firstParaEnd) : stripped).trim();
  const sentences = head
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let out = "";
  for (const s of sentences) {
    if (!out) {
      out = s;
    } else if (out.length + 1 + s.length <= maxChars) {
      out = `${out} ${s}`;
    } else {
      break;
    }
  }
  if (!out) out = head;
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1).trimEnd()}…`;
  return out;
}

/**
 * Convert a server-side Message row into the local ChatMsg shape the panel
 * already renders. Tool-call messages from the wire mirror are short bodies
 * starting with "→ " — we route those to the `system` track so they render
 * as the compact mono-font lines instead of full assistant bubbles.
 */
function messageEventToChat(
  m: MessageEventPayload | (MessageEventPayload & { createdAt: string; updatedAt: string }),
): ChatMsg | null {
  const createdAt =
    typeof m.createdAt === "string"
      ? new Date(m.createdAt).getTime()
      : m.createdAt instanceof Date
        ? m.createdAt.getTime()
        : Date.now();
  const text = typeof m.body === "string" ? m.body : "";
  if (m.role === "USER") return { id: m.id, role: "user", text, createdAt };
  // Skip empty AGENT/SYSTEM rows — the server creates a placeholder ahead of
  // streaming, and an empty bubble between turns is just noise.
  if (!text) return null;
  // Tool-call mirror rows are emitted as short lines starting with "→ ".
  // Render them as compact system entries to match the live wire format.
  if (text.startsWith("→ ")) {
    return { id: m.id, role: "system", text, createdAt };
  }
  return { id: m.id, role: "assistant", text, createdAt };
}

function parseStoredOutput(output: string, fallbackAt?: number): WireEvent[] {
  const out: WireEvent[] = [];
  for (const raw of output.split("\n")) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as WireEvent;
      if (parsed.at == null && fallbackAt != null) parsed.at = fallbackAt;
      out.push(parsed);
    } catch {
      // skip
    }
  }
  return out;
}

function DesktopPanel({
  ticketId,
  workspaceId,
  projectId,
  title,
  description,
  identifier,
  statusKey,
}: Props): React.ReactElement {
  // Track current statusKey via ref so the streaming-event handler (mounted
  // once with [] deps) can read the latest value without resubscribing. We
  // also mutate the ref locally when we apply Blocked/Running so back-to-back
  // events don't all fire status writes against a stale cache. Sync from the
  // prop only when it actually changes — render-time assignment would clobber
  // a just-applied local override (e.g. "blocked") before the server-driven
  // prop refresh catches up, leaving the card stuck in Running.
  const statusKeyRef = useRef<string | undefined>(statusKey);
  useEffect(() => {
    statusKeyRef.current = statusKey;
  }, [statusKey]);
  const messagesRef = useRef<ChatMsg[]>([]);
  const setBlockedIfAwaiting = () => {
    if (statusKeyRef.current !== "building") return;
    // Concatenate every assistant message since the last user message.
    // Claude Code emits a fresh assistant bubble after every tool round-trip,
    // so a single turn frequently looks like [big-bubble-with-question?,
    // tool-call, tiny-trailing-bubble-with-no-?]. Reading only the last
    // bubble silently misses the question — which is exactly how a ticket
    // gets stranded in Running when the agent asked "should we X?" and
    // then ended the turn with "Proceeding to Y."
    const msgs = messagesRef.current;
    const lastUserIdx = (() => {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === "user") return i;
      }
      return -1;
    })();
    const turnText = msgs
      .slice(lastUserIdx + 1)
      .filter((m) => m.role === "assistant")
      .map((m) => m.text)
      .join("\n\n");
    if (!turnText || !looksLikeAwaitingUser(turnText)) return;
    statusKeyRef.current = "blocked";
    void applyWorkflowStatusSuggestion(ticketId, "blocked").catch(() => {});
  };
  const clearBlocked = () => {
    if (statusKeyRef.current !== "blocked") return;
    statusKeyRef.current = "building";
    void applyWorkflowStatusSuggestion(ticketId, "building").catch(() => {});
  };

  // Called when the agent finishes a run with no pending workflow steps and
  // is not awaiting user input. Tries the PR-based decision server-side
  // first (open → review, merged → completed, conflict → blocked), then
  // falls back to a local Claude Code one-shot pick from allowed statuses.
  const decideEndOfRun = async () => {
    if (statusKeyRef.current !== "building") return;
    try {
      const r = await decideEndOfRunStatus(ticketId);
      if (r.ok && r.statusKey) {
        statusKeyRef.current = r.statusKey;
        return;
      }
    } catch {
      // tolerated — try the LLM fallback
    }
    try {
      const bridge = getDesktopBridge();
      if (!bridge?.agentOneshot) return;
      const ctxRes = await getWorkflowStatusContext(ticketId);
      if (!ctxRes.ok || ctxRes.statuses.length === 0) return;
      const allowed = ctxRes.statuses.map((s) => s.key);
      const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
      const summary = lastAssistant ? lastAssistant.text.slice(-1500) : "(no agent output)";
      const askPrompt = [
        "You are picking the kanban status for a ticket whose Claude Code session just ended.",
        "Status keys (typical meanings): backlog (not started), todo (planned), building (agent is still actively working — only pick this if the session is mid-tool-call, NOT if it has stopped to ask the user something), blocked (the agent stopped its turn and is waiting on the user — includes any open question, choice between options, request to confirm/approve, or proposed default like 'Default is A unless you say otherwise'), review (PR open / ready to review), completed (done/merged).",
        "Decision rule: if the last agent message poses ANY question, lists options for the user to pick, asks for confirmation/approval, or proposes a default while waiting for the user to override it, the answer is `blocked`. Only return `building` if the agent is clearly still mid-task with no user input expected.",
        'Reply with strict JSON only: {"statusKey":"<one of allowed>","reason":"short"}. No prose, no fences.',
        "",
        `Allowed status keys: ${allowed.join(", ")}`,
        `Current status: ${ctxRes.currentStatusKey || "(unknown)"}`,
        `Ticket title: ${ctxRes.title}`,
        ctxRes.description ? `Ticket description:\n${ctxRes.description}` : "",
        "Last agent message (tail):",
        summary,
      ]
        .filter(Boolean)
        .join("\n");
      const res = await bridge.agentOneshot({
        prompt: askPrompt,
        timeoutMs: 15_000,
      });
      if (!res.ok || !res.text) return;
      const stripped = res.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      let suggested: string | undefined;
      try {
        const parsed = JSON.parse(stripped) as { statusKey?: unknown };
        if (typeof parsed.statusKey === "string" && allowed.includes(parsed.statusKey)) {
          suggested = parsed.statusKey;
        }
      } catch {
        // unparseable — leave status alone
      }
      if (suggested && suggested !== statusKeyRef.current) {
        statusKeyRef.current = suggested;
        await applyWorkflowStatusSuggestion(ticketId, suggested).catch(() => {});
      }
    } catch {
      // tolerated
    }
  };
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentAssistantId = useRef<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  jobIdRef.current = jobId;
  // Mirror sessionId into a ref so the bridge subscription (mounted once
  // with [] deps) can filter incoming events without resubscribing.
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;
  const workflowQueueRef = useRef<string[]>([]);
  // Idle watchdog: if no bridge events arrive for IDLE_TIMEOUT_MS while busy,
  // assume the agent stalled (child crashed without flushing `result`, network
  // dropped, unknown event shape) and force the panel out of "thinking…" so
  // the workflow queue can drain or the user can intervene.
  const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armIdleTimer = (onTimeout: () => void) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(onTimeout, IDLE_TIMEOUT_MS);
  };
  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setRepoPath(null);
    void (async () => {
      const result = await getProjectLocalPath(projectId);
      if (cancelled) return;
      if (result.ok) setRepoPath(result.localPath);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Hydrate from server in two passes:
  //   1. /api/v1/tickets/:id/messages → durable per-ticket Conversation. This
  //      is the source of truth for chat history and survives every kind of
  //      session boundary (new AgentJob, workflow run, page refresh, fresh
  //      browser). Replaces the old "replay latest AgentJob.output JSONL"
  //      path that silently dropped prior conversations the moment any new
  //      AgentJob row was created.
  //   2. /api/tickets/:id/desktop-jobs → run-state only (worktreePath,
  //      claudeSessionId, jobId, busy). The job's `output` blob is no longer
  //      consulted for chat rendering.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setWorktreePath(null);
    setClaudeSessionId(null);
    setSessionId(null);
    setJobId(null);
    setBusy(false);
    currentAssistantId.current = null;
    messagesRef.current = [];

    void (async () => {
      try {
        const r = await fetch(`/api/v1/tickets/${ticketId}/messages?limit=200`, {
          cache: "no-store",
        });
        if (cancelled || !r.ok) return;
        const json = (await r.json()) as {
          ok: boolean;
          data?: {
            items: (MessageEventPayload & { createdAt: string; updatedAt: string })[];
          };
        };
        if (cancelled || !json.ok || !json.data) return;
        const items = [...json.data.items].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const mapped = items
          .map((m) => messageEventToChat(m))
          .filter((m): m is ChatMsg => m !== null);
        messagesRef.current = mapped;
        setMessages(mapped);
      } catch {
        // tolerate — empty chat is fine; live wire events will populate
      }
    })();

    void (async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/desktop-jobs`, { cache: "no-store" });
        const body = (await res.json()) as {
          ok: boolean;
          data: {
            id: string;
            status: string;
            output: string;
            worktreePath: string | null;
            claudeSessionId: string | null;
            createdAt?: string;
          } | null;
        };
        if (cancelled || !body.ok || !body.data) return;
        const job = body.data;
        // Parse the wire log for run-state signals only (claudeSessionId, did
        // the run end). Don't push chat messages — that's now sourced from
        // the Conversation hydration above.
        const fallbackAt = job.createdAt ? new Date(job.createdAt).getTime() : undefined;
        const events = parseStoredOutput(job.output, fallbackAt);
        const cursor = { current: null as string | null };
        let throwaway: ChatMsg[] = [];
        let resolvedClaudeSession: string | null = null;
        let endedInEvents = false;
        for (const ev of events) {
          const r = applyWireEvent(ev, throwaway, cursor);
          throwaway = r.msgs;
          if (r.claudeSessionId !== undefined) resolvedClaudeSession = r.claudeSessionId;
          if (r.ended) endedInEvents = true;
        }
        setWorktreePath(job.worktreePath);
        setClaudeSessionId(resolvedClaudeSession ?? job.claudeSessionId);
        setJobId(job.id);
        if (job.status === "RUNNING" && !endedInEvents) {
          // Re-attach to a live session the previous dialog instance started,
          // so Stop/Send work instead of being detached zombies. If no live
          // session exists in this renderer, the underlying process is gone
          // (or this is a different renderer); show the panel as idle.
          const liveSid = getAgentSessionByTicket(ticketId);
          if (liveSid) {
            setSessionId(liveSid);
            setBusy(true);
          } else {
            setBusy(false);
          }
        } else {
          setBusy(false);
        }
      } catch {
        // ignore — empty hydrate
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Realtime: workspace channel publishes message.created/updated whenever
  // the server-side mirror writes a Message row. Upsert into local state so
  // history from other browser tabs / desktop sessions / agent replies lands
  // without a refresh. We dedupe by id; live wire events already optimistic-
  // render the local turn so duplicates from realtime are absorbed.
  const onRealtimeEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name === "message.created" && event.ticketId === ticketId) {
        const next = messageEventToChat(event.message);
        if (!next) return;
        const prev = messagesRef.current;
        if (prev.some((m) => m.id === next.id)) return;
        // Dedupe local optimistic echoes: if we already have a same-role
        // bubble with identical text within 10s of the server timestamp, drop
        // the optimistic copy and keep the server-authoritative one.
        const filtered = prev.filter(
          (m) =>
            !(
              m.role === next.role &&
              m.text === next.text &&
              Math.abs(m.createdAt - next.createdAt) < 10_000
            ),
        );
        const merged = [...filtered, next].sort((a, b) => a.createdAt - b.createdAt);
        messagesRef.current = merged;
        setMessages(merged);
      } else if (event.name === "message.updated" && event.ticketId === ticketId) {
        const prev = messagesRef.current;
        const idx = prev.findIndex((m) => m.id === event.messageId);
        if (idx === -1) return;
        if (event.body === undefined) return;
        const merged = prev.slice();
        const cur = merged[idx]!;
        merged[idx] = { ...cur, text: event.body } as ChatMsg;
        messagesRef.current = merged;
        setMessages(merged);
      }
    },
    [ticketId],
  );
  useBoardChannel(workspaceId, onRealtimeEvent);

  const patchJob = (body: {
    appendOutput?: string;
    status?: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
    exitCode?: number;
    worktreePath?: string | null;
    claudeSessionId?: string | null;
  }): void => {
    const id = jobIdRef.current;
    if (!id) return;
    void fetch(`/api/desktop-jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  };

  const forceEndOnIdle = () => {
    idleTimerRef.current = null;
    // Treat as a synthetic end-of-turn: clear busy, surface a system message,
    // and let the queue drain. Don't kill the underlying session — the user
    // can still Stop/Send. If the child is genuinely dead, next user input
    // will fail loudly via agentSend.
    const stalledMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "system",
      text: `Agent idle for ${Math.round(IDLE_TIMEOUT_MS / 60000)} min — no events received. Marking turn ended; press Stop or send a new message to retry.`,
      createdAt: Date.now(),
    };
    messagesRef.current = [...messagesRef.current, stalledMsg];
    setMessages(messagesRef.current);
    currentAssistantId.current = null;
    setBusy(false);
    toast.error("Claude Code went idle — see ticket panel");
  };

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || typeof bridge.onAgentEvent !== "function") return;
    return bridge.onAgentEvent((e: AgentEvent) => {
      // The bridge broadcasts events for every active session in the app.
      // Without this filter, a ticket's panel would render another ticket's
      // streaming output and PATCH its claudeSessionId onto the wrong job.
      if (e.sessionId !== sessionIdRef.current) return;
      // Any event from our session = agent is alive. Reset the watchdog.
      armIdleTimer(forceEndOnIdle);
      const wire: WireEvent =
        e.type === "exit"
          ? { kind: "exit", code: e.code }
          : e.type === "stderr"
            ? { kind: "stderr", line: e.line }
            : { kind: "agent", line: e.line };

      // NB: persistence (PATCH /api/desktop-jobs/:id) for `wire` and exit
      // status is done by the global AgentSessionManager — see
      // src/lib/agent-session-manager.ts. Doing it here too would
      // double-append. We still PATCH worktreePath / claudeSessionId locally
      // because those don't come from bridge events.

      const r = applyWireEvent(wire, messagesRef.current, currentAssistantId);
      messagesRef.current = r.msgs;
      setMessages(r.msgs);
      if (r.claudeSessionId !== undefined) {
        setClaudeSessionId(r.claudeSessionId);
        patchJob({ claudeSessionId: r.claudeSessionId });
      }
      if (r.ended) {
        clearIdleTimer();
        setBusy(false);
        if (wire.kind === "exit") {
          setSessionId(null);
        }
        // An error result (Claude SDK is_error / subtype error_*) is treated
        // as "agent stopped, user must intervene": force Blocked, log a NOTE
        // activity so the rail shows it, and skip the awaiting/decide path
        // (which would otherwise try to land a normal terminal status).
        if (r.errorEnd) {
          if (statusKeyRef.current !== "blocked") {
            statusKeyRef.current = "blocked";
            void applyWorkflowStatusSuggestion(ticketId, "blocked").catch(() => {});
          }
          const summary = r.errorEnd.summary.replace(/\s+/g, " ").trim();
          const note = summary
            ? `Agent error: ${summary.slice(0, 480)}`
            : `Agent error${r.errorEnd.subtype ? ` (${r.errorEnd.subtype})` : ""}`;
          void logWorkflowActivity({ ticketId, text: note }).catch(() => {});
          return;
        }
        // End-of-turn: always evaluate where the ticket should land. Workflow
        // steps no longer auto-chain, so there is no "queue still draining"
        // case to bail out for. If a workflow had remaining steps queued, the
        // drain effect drops them and the ticket lands in Blocked here so the
        // user can review and click Run to start the next step.
        const hadQueuedNextStep = workflowQueueRef.current.length > 0;
        const wasBuilding = statusKeyRef.current === "building";
        // Always scan for an awaiting-user question on turn end — including
        // wire.kind === "exit" with code 0, which is the *normal* end of a
        // Claude CLI run in --print mode (one process per turn). Skipping it
        // on every exit stranded tickets in Running whenever the model asked
        // a question right before the process exited cleanly.
        setBlockedIfAwaiting();
        // If there were queued workflow steps OR the heuristic didn't catch
        // a question, still gate on the human: force Blocked. Erring toward
        // Blocked is intentional — a stranded Running card is invisible; a
        // Blocked card the user dismisses with one click is not.
        if (hadQueuedNextStep && statusKeyRef.current === "building") {
          statusKeyRef.current = "blocked";
          void applyWorkflowStatusSuggestion(ticketId, "blocked").catch(() => {});
        }
        // If neither the regex nor the workflow-gate moved us, fall back to
        // the PR-based decision (open → review, merged → completed, conflict
        // → blocked). Without this, clean runs that finish with no question
        // and no PR would strand the card in Running forever.
        if (wasBuilding && statusKeyRef.current === "building") {
          void decideEndOfRun();
        }
      }
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const pickRepo = async (): Promise<string | null> => {
    const bridge = getDesktopBridge();
    if (!bridge) return null;
    const result = await bridge.pickRepoPath();
    if (!result.ok || !result.path) {
      if (result.error) toast.error(result.error);
      return null;
    }
    setRepoPath(result.path);
    const saved = await updateProject({ id: projectId, localPath: result.path });
    if (!saved.ok) toast.error(`Could not save folder: ${saved.error}`);
    window.dispatchEvent(new CustomEvent("planbooq:project-local-path-changed"));
    return result.path;
  };

  const sendRef = useRef<((override?: string) => Promise<void>) | null>(null);

  // Listen for workflow Run events: enqueue prompts, drain when idle.
  useEffect(() => {
    const onRun = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ticketId?: string; prompts?: string[] };
      if (!detail || detail.ticketId !== ticketId || !Array.isArray(detail.prompts)) return;
      workflowQueueRef.current.push(...detail.prompts);
      // Kick a drain attempt; further drains happen via the busy effect below.
      if (!busy && sendRef.current) {
        const next = workflowQueueRef.current.shift();
        if (next) void sendRef.current(next);
      }
    };
    window.addEventListener("planbooq:workflow-run", onRun);
    return () => window.removeEventListener("planbooq:workflow-run", onRun);
  }, [ticketId, busy]);

  // Workflow steps no longer auto-chain. When a step finishes, the queue is
  // intentionally NOT drained — the ticket goes to Blocked and the user must
  // click Run again to start the next step. This makes "agent done with step,
  // human reviews, human decides" the explicit contract instead of letting
  // the agent rubber-stamp itself by saying "Proceeding to Build." mid-turn.
  // Any prompts left in the queue from a "Run all" click are dropped here.
  useEffect(() => {
    if (busy) return;
    if (workflowQueueRef.current.length === 0) return;
    workflowQueueRef.current = [];
  }, [busy]);

  // Broadcast busy/queue state so the workflow panel can reflect "running".
  useEffect(() => {
    const running = busy || workflowQueueRef.current.length > 0;
    window.dispatchEvent(new CustomEvent("planbooq:agent-busy", { detail: { ticketId, running } }));
    // Whenever Claude is actively working, force the ticket into Running
    // regardless of its current column — the agent's live state is the
    // source of truth for "is work happening right now."
    if (running && statusKeyRef.current !== "building") {
      statusKeyRef.current = "building";
      void applyWorkflowStatusSuggestion(ticketId, "building").catch(() => {});
    }
  }, [busy, ticketId]);

  const send = async (override?: string) => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const message = (override ?? input).trim();
    if (!message) return;
    // User is responding — undo any auto-Blocked move so the card lands back
    // in Running while Claude works on the reply.
    clearBlocked();

    if (typeof bridge.agentStart !== "function" || typeof bridge.agentSend !== "function") {
      toast.error("Desktop app is out of date — quit and relaunch Planbooq");
      return;
    }

    if (!sessionId) {
      // Cold start: either resume a prior conversation in an existing worktree,
      // or create a fresh worktree + first turn.
      const canResume =
        !!worktreePath && !!claudeSessionId && typeof bridge.agentResume === "function";
      setBusy(true);
      armIdleTimer(forceEndOnIdle);
      setMessages((m) => {
        const next = [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "user",
            text: message,
            createdAt: Date.now(),
          } as ChatMsg,
        ];
        messagesRef.current = next;
        return next;
      });
      setInput("");

      // Open a server-side desktop job so this conversation is durable.
      try {
        const r = await fetch(`/api/tickets/${ticketId}/desktop-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: message,
            worktreePath,
            claudeSessionId,
          }),
        });
        const body = (await r.json()) as { ok: boolean; data?: { jobId: string } };
        if (body.ok && body.data) {
          setJobId(body.data.jobId);
          jobIdRef.current = body.data.jobId;
          // Persist the user turn as the first wire event.
          patchJob({ appendOutput: serializeWire({ kind: "user", text: message }) });
        }
      } catch {
        // tolerate — local session still works, but won't survive refresh
      }

      // Mint a fresh short-lived API token and pass it via env to claude. The
      // wrapper at ./.planbooq/pbq reads it from $PLANBOOQ_TOKEN — never on disk.
      let ticketCtx: Parameters<typeof bridge.agentStart>[0]["ticket"];
      try {
        const minted = await mintAgentApiKey({ workspaceId });
        if (minted.ok) {
          ticketCtx = {
            ticketId,
            identifier,
            title,
            apiBaseUrl: window.location.origin,
            apiToken: minted.data.token,
          };
        }
      } catch {}

      if (canResume) {
        // Worktree exists — write any new attachments and rewrite URLs before
        // the message reaches Claude.
        const { text: resumeMessage } = await materializeAttachmentsAndRewrite(
          message,
          worktreePath!,
        );
        try {
          const res = await bridge.agentResume({
            worktreePath: worktreePath!,
            claudeSessionId: claudeSessionId!,
            message: resumeMessage,
            ticket: ticketCtx,
          });
          if (!res.ok || !res.sessionId) {
            toast.error(res.error ?? "Resume failed");
            setBusy(false);
            return;
          }
          setSessionId(res.sessionId);
          if (jobIdRef.current) {
            registerAgentSession(res.sessionId, {
              jobId: jobIdRef.current,
              workspaceId,
              ticketId,
            });
          }
          return;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Resume failed");
          setBusy(false);
          return;
        }
      }

      if (!repoPath) {
        toast.error("Pick a project folder first");
        setBusy(false);
        return;
      }
      const path = repoPath;
      let workflowBlock = "";
      try {
        const wf = await getTicketWorkflow(ticketId);
        if (wf.ok && wf.steps.length > 0) {
          const label = wf.templateName ? `Workflow: ${wf.templateName}` : "Workflow";
          const lines = wf.steps.map((s, i) => {
            const tag = s.enabled ? "" : " (disabled)";
            const body = s.prompt?.trim() ? `\n   ${s.prompt.trim().replace(/\n/g, "\n   ")}` : "";
            return `${i + 1}. ${s.name}${tag}${body}`;
          });
          workflowBlock = `## ${label}\n${lines.join("\n")}`;
        }
      } catch {}
      const seed = [`# ${title}`, description ?? "", workflowBlock, message]
        .filter((s) => s !== "")
        .join("\n\n")
        .trim();
      const branch = `pbq-${ticketId.slice(0, 8)}-${Date.now().toString(36)}`;

      // No worktree yet — pre-rewrite the seed to the conventional path the
      // bridge will use; the bridge then writes the files alongside.
      const { text: rewrittenSeed, items: seedAttachments } =
        await materializeAttachmentsAndRewrite(seed, null);

      let res: Awaited<ReturnType<typeof bridge.agentStart>>;
      try {
        res = await bridge.agentStart({
          repoPath: path,
          branch,
          firstMessage: rewrittenSeed,
          ticket: ticketCtx,
          attachments: seedAttachments,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("No handler registered")) {
          toast.error("Desktop app is out of date — fully quit and relaunch Planbooq");
        } else {
          toast.error(msg);
        }
        setBusy(false);
        return;
      }
      if (!res.ok || !res.sessionId) {
        toast.error(res.error ?? "Failed to start session");
        setBusy(false);
        return;
      }
      setSessionId(res.sessionId);
      setWorktreePath(res.worktreePath ?? null);
      patchJob({ worktreePath: res.worktreePath ?? null });
      if (jobIdRef.current) {
        registerAgentSession(res.sessionId, {
          jobId: jobIdRef.current,
          workspaceId,
          ticketId,
        });
      }
      return;
    }

    setBusy(true);
    armIdleTimer(forceEndOnIdle);
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text: message, createdAt: Date.now() },
    ]);
    patchJob({ appendOutput: serializeWire({ kind: "user", text: message }) });
    setInput("");
    // Materialize attachments into the existing worktree before sending so
    // the agent can `Read` them as local files instead of curling an
    // auth-protected URL.
    const { text: sendMessage } = await materializeAttachmentsAndRewrite(message, worktreePath);
    try {
      const res = await bridge.agentSend({ sessionId, message: sendMessage });
      if (!res.ok) {
        toast.error(res.error ?? "Send failed");
        setBusy(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
      setBusy(false);
    }
  };

  sendRef.current = send;

  const stop = async () => {
    const bridge = getDesktopBridge();
    if (!bridge || !sessionId) return;
    clearIdleTimer();
    // Mark BEFORE invoking agentStop so the resulting exit event is
    // classified as CANCELED (user intent) instead of FAILED. Without this,
    // the ticket would land in `blocked` even though the user explicitly
    // stopped — we want `todo` in that case.
    markSessionStoppedByUser(sessionId);
    await bridge.agentStop({ sessionId });
  };

  // Clear watchdog on unmount so we don't fire after the panel is gone.
  useEffect(() => clearIdleTimer, []);

  if (!repoPath) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3">
        <Button size="sm" onClick={pickRepo}>
          <Folder className="size-4" />
          Choose Folder
        </Button>
        <p className="text-[12px] text-muted-foreground">
          Pick this project's folder so Claude Code has a repo to work in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded-lg bg-muted/20 p-3"
        >
          {messages.map((m, i) => {
            const isStreaming = busy && m.role === "assistant" && i === messages.length - 1;
            const isAssistant = m.role === "assistant";
            const displayText = m.text;
            const author = m.role === "user" ? "You" : m.role === "assistant" ? "Claude" : "System";
            const align = m.role === "user" ? "self-end items-end" : "self-start items-start";
            const time = formatDistanceToNowStrict(new Date(m.createdAt), { addSuffix: true });
            return (
              <div key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${align}`}>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium">{author}</span>
                  <span title={new Date(m.createdAt).toLocaleString()}>{time}</span>
                </div>
                <div
                  className={
                    m.role === "user"
                      ? "rounded-lg bg-primary/10 px-3 py-2 text-[13px] whitespace-pre-wrap"
                      : m.role === "system"
                        ? "max-w-full pl-1 text-[11px] font-mono text-muted-foreground/80 break-all leading-snug"
                        : "min-w-0 rounded-lg bg-background px-3 py-2 break-words"
                  }
                >
                  {isAssistant ? (
                    <Markdown className="text-[13px]">{displayText}</Markdown>
                  ) : (
                    m.text
                  )}
                  {isStreaming && (
                    <span className="ml-1 inline-block align-middle">
                      <Loader2 className="inline size-3 animate-spin" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {busy &&
            (messages.length === 0 || messages[messages.length - 1]!.role !== "assistant") && (
              <div className="self-start text-[12px] text-muted-foreground">
                <Loader2 className="inline size-3 animate-spin" /> thinking…
              </div>
            )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          onPaste={(e) => {
            const bridge = getDesktopBridge();
            if (!bridge?.saveClipboardImage) return;
            const items = Array.from(e.clipboardData?.items ?? []);
            const imageItem = items.find(
              (it) => it.kind === "file" && it.type.startsWith("image/"),
            );
            if (!imageItem) return;
            const file = imageItem.getAsFile();
            if (!file) return;
            e.preventDefault();
            const ext = (file.type.split("/")[1] ?? "png").split("+")[0]!;
            void (async () => {
              try {
                const buf = new Uint8Array(await file.arrayBuffer());
                let bin = "";
                for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
                const dataBase64 = btoa(bin);
                const r = await bridge.saveClipboardImage!({ dataBase64, ext });
                if (!r.ok || !r.path) {
                  toast.error(r.error ?? "Could not save image");
                  return;
                }
                const md = `![pasted](${r.path})`;
                setInput((prev) => (prev ? `${prev.replace(/\s*$/, "")}\n${md}` : md));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Paste failed");
              }
            })();
          }}
          placeholder={
            sessionId
              ? "Reply to Claude…"
              : `Start a session — first message will include "${title}"`
          }
          rows={2}
          className="min-h-[60px] flex-1 resize-y rounded-lg bg-muted/40 px-3 py-2 text-[13px] outline-none focus:bg-muted/60"
        />
        {busy ? (
          <Button size="sm" variant="outline" onClick={stop}>
            <Square className="size-4" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => send()} disabled={!input.trim()}>
            {sessionId ? <Send className="size-4" /> : <Play className="size-4" />}
            {sessionId ? "Send" : "Start"}
          </Button>
        )}
      </div>
    </div>
  );
}

function WebPanel({ ticketId, workspaceId }: Props): React.ReactElement {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listAgents({ workspaceId }).then((res) => {
      if (res.ok) {
        const live = res.data.filter((a) => !a.revokedAt);
        setAgents(live);
        if (live.length > 0) setSelectedAgent(live[0]!.id);
      }
    });
  }, [workspaceId]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/jobs`, { cache: "no-store" });
        const body = await res.json();
        if (!stopped && body.ok) setJobs(body.data);
      } catch {}
    };
    void tick();
    const t = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [ticketId]);

  const dispatch = () => {
    if (!selectedAgent) return;
    startTransition(async () => {
      const res = await dispatchTicketToAgent({ ticketId, agentId: selectedAgent });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dispatched");
    });
  };

  const cancelJob = async (jobId: string): Promise<void> => {
    // Optimistic flip so the badge updates instantly even if the agent is
    // slow to ack; the next 2.5s poll will reconcile from the DB.
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: "CANCELED" as const } : j)),
    );
    try {
      const res = await fetch(`/api/tickets/${ticketId}/jobs/${jobId}/cancel`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? `Cancel failed (${res.status})`);
        return;
      }
      toast.success("Stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="min-w-[200px] flex-1 rounded border bg-background px-2 py-1 text-sm"
          value={selectedAgent ?? ""}
          onChange={(e) => setSelectedAgent(e.target.value || null)}
          disabled={agents.length === 0}
        >
          {agents.length === 0 && <option value="">No agents paired</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.hostname ? `· ${a.hostname}` : ""}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={dispatch} disabled={!selectedAgent || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run
        </Button>
      </div>
      {agents.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Pair a machine in <code>Settings → Agents</code> to dispatch this ticket to your local
          Claude Code.
        </p>
      )}
      {jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          {jobs.slice(0, 3).map((j) => (
            <details
              key={j.id}
              className="rounded border bg-muted/20 p-2 text-xs"
              open={j.status === "RUNNING" || j.status === "PENDING"}
            >
              <summary className="flex cursor-pointer select-none items-center gap-2">
                <span className="font-mono">{j.status}</span>
                {j.agent && <span>on {j.agent.name}</span>}
                <span className="text-muted-foreground">
                  {new Date(j.createdAt).toLocaleString()}
                </span>
                {typeof j.exitCode === "number" && (
                  <span className="text-muted-foreground">exit {j.exitCode}</span>
                )}
                {(j.status === "RUNNING" || j.status === "PENDING") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-6 px-2 text-[11px]"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void cancelJob(j.id);
                    }}
                  >
                    <Square className="size-3" />
                    Stop
                  </Button>
                )}
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                {j.output || "(no output yet)"}
                {j.error ? `\n\n[error] ${j.error}` : ""}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

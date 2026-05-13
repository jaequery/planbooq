// Wire protocol between the Electron app and the broker.
//
// Transport: HTTP over a Unix domain socket at
//   ~/Library/Application Support/Planbooq/broker.sock (macOS).
//
// Commands are POST JSON; event streams are GET text/event-stream (SSE).
// Keep this file pure types — no runtime — so it can be imported from both
// the broker bundle and the Electron main bundle without dragging deps.

export type TicketContext = {
  ticketId: string;
  identifier: string;
  title: string;
  apiBaseUrl: string;
  apiToken: string;
};

export type StartRequest = {
  // Worktree where claude should run. Main creates it before calling.
  worktreePath: string;
  // Raw first user message — what we display in the chat thread. The broker
  // persists this verbatim via the `{kind:"user"}` wire event.
  firstMessage: string;
  // Optional instruction-only text prepended to `firstMessage` before being
  // piped to Claude's stdin. Used for the PLANBOOQ.md re-read directive so
  // Claude sees it without it leaking into the user-visible message body.
  claudePreamble?: string;
  ticket?: TicketContext;
  // Server-side AgentJob id; broker will heartbeat against this row.
  jobId?: string;
  // Active workflow step (if any) — stamped on every wire event.
  workflowStepRunId?: string | null;
  // Per-session log file. Broker writes wire events here so even if broker
  // restarts mid-session the output is on disk.
  logPath?: string;
};

export type ResumeRequest = {
  worktreePath: string;
  claudeSessionId: string;
  // Raw first user message of the resumed chat — displayed verbatim in the
  // chat thread. Pair with `claudePreamble` if Claude needs additional
  // stdin-only context (e.g. re-reading PLANBOOQ.md at session top).
  message: string;
  // Optional instruction-only text prepended to `message` before being piped
  // to Claude's stdin. Not persisted in the chat thread.
  claudePreamble?: string;
  ticket?: TicketContext;
  jobId?: string;
  workflowStepRunId?: string | null;
  logPath?: string;
};

export type SendRequest = {
  sessionId: string;
  message: string;
  workflowStepRunId?: string | null;
};

export type StopRequest = {
  sessionId: string;
};

export type OneshotRequest = {
  prompt: string;
  timeoutMs?: number;
};

export type SessionInfo = {
  sessionId: string;
  ticketId: string | null;
  jobId: string | null;
  cwd: string;
  startedAt: number;
  busy: boolean;
};

export type StartResponse = { ok: true; sessionId: string } | { ok: false; error: string };

export type ResumeResponse = { ok: true; sessionId: string } | { ok: false; error: string };

export type SendResponse = { ok: true } | { ok: false; error: string };

export type StopResponse = { ok: true } | { ok: false; error: string };

export type OneshotResponse = { ok: true; text: string } | { ok: false; error: string };

export type ListSessionsResponse = { ok: true; sessions: SessionInfo[] };

// Events delivered over SSE on /events. Mirror the existing renderer-facing
// event names so the renderer code doesn't need to change.
export type WireEventOut =
  | { type: "agent"; sessionId: string; line: string }
  | { type: "stderr"; sessionId: string; line: string }
  | { type: "exit"; sessionId: string; code: number };

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
  // First user message. Main has already prepended the PLANBOOQ.md preamble.
  firstMessage: string;
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
  // First user message of the resumed chat. Main has already prepended the
  // PLANBOOQ.md preamble (same line as `StartRequest.firstMessage`) so the
  // resumed Claude session rereads the ticket context at the top of the
  // new chat.
  message: string;
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

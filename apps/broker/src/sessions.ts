import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SessionInfo, TicketContext, WireEventOut } from "./protocol";

// =============================================================================
// Per-session wire log. Same format as the desktop bridge wrote before
// (~/.planbooq/agent-logs/<sessionId>.log) so existing forensics tooling
// keeps working. Broker is now the writer.
// =============================================================================

const AGENT_LOG_DIR = path.join(os.homedir(), ".planbooq", "agent-logs");
const logStreams = new Map<string, WriteStream>();

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(AGENT_LOG_DIR, { recursive: true });
  } catch {
    // Logging failure is never fatal — the session must run regardless.
  }
}
void ensureLogDir();

function logPathFor(sessionId: string): string {
  return path.join(AGENT_LOG_DIR, `${sessionId}.log`);
}

function openLogStream(sessionId: string): WriteStream | null {
  const cached = logStreams.get(sessionId);
  if (cached) return cached;
  try {
    const stream = createWriteStream(logPathFor(sessionId), { flags: "a" });
    stream.on("error", () => {});
    logStreams.set(sessionId, stream);
    return stream;
  } catch {
    return null;
  }
}

export function logLine(
  sessionId: string,
  kind: string,
  payload?: Record<string, unknown> | string,
): void {
  const stream = openLogStream(sessionId);
  if (!stream) return;
  const ts = new Date().toISOString();
  let line: string;
  if (typeof payload === "string") {
    line = `${ts}\t${kind}\t${payload.replace(/\n+$/, "")}\n`;
  } else if (payload) {
    line = `${ts}\t${kind}\t${JSON.stringify(payload)}\n`;
  } else {
    line = `${ts}\t${kind}\n`;
  }
  stream.write(line);
}

function closeLogStream(sessionId: string): void {
  const stream = logStreams.get(sessionId);
  if (!stream) return;
  logStreams.delete(sessionId);
  try {
    stream.end();
  } catch {}
}

// =============================================================================
// Session map.
// =============================================================================

type Session = {
  proc: ChildProcess;
  cwd: string;
  ticketId: string | null;
  startedAt: number;
  jobId: string | null;
  apiBaseUrl: string | null;
  apiToken: string | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  // Last time we fired any PATCH (append, user-message, terminal). Used to
  // suppress the heartbeat tick when a recent PATCH already bumped updatedAt
  // — the heartbeat is purely an "I'm alive" updatedAt-touch, and any other
  // PATCH does that for free.
  lastPatchAt: number;
  appendBuffer: string;
  appendTimer: ReturnType<typeof setTimeout> | null;
  userStopped: boolean;
  terminalSent: boolean;
  currentStepRunId: string | null;
};

const sessions = new Map<string, Session>();

const HEARTBEAT_MS = 30_000;
// Coalesce wire output into infrequent PATCHes per session. The renderer gets
// live frames over IPC/SSE directly from the broker, so DB durability doesn't
// need sub-second granularity — and shorter intervals just inflate PATCH
// volume (and Ably fanout) on busy sessions.
//
// Two-trigger flush: whichever fires first.
//   - APPEND_FLUSH_MS: slow sessions never wait longer than this for durability
//   - APPEND_FLUSH_BYTES: chatty sessions ship blocks of output in one round
//     trip instead of N tiny ones
const APPEND_FLUSH_MS = 2_500;
const APPEND_FLUSH_BYTES = 8 * 1024;

// =============================================================================
// Event fanout — every SSE subscriber gets every event. Filtering by
// sessionId / ticketId happens in the client.
// =============================================================================

type EventListener = (ev: WireEventOut) => void;
const listeners = new Set<EventListener>();

export function subscribe(listener: EventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(ev: WireEventOut): void {
  for (const l of listeners) {
    try {
      l(ev);
    } catch {
      // listener errors must not break the broker
    }
  }
}

// =============================================================================
// Heartbeat plumbing
// =============================================================================

function clearHeartbeat(s: Session): void {
  if (s.heartbeatTimer) {
    clearInterval(s.heartbeatTimer);
    s.heartbeatTimer = null;
  }
}

function startHeartbeat(s: Session, sessionId: string): void {
  if (!s.jobId || !s.apiBaseUrl || !s.apiToken) return;
  clearHeartbeat(s);
  const jobId = s.jobId;
  const url = `${s.apiBaseUrl}/api/desktop-jobs/${jobId}`;
  const token = s.apiToken;
  const tick = (): void => {
    // Suppress when any other PATCH already bumped updatedAt within the
    // heartbeat window — the server-side liveness check is identical, and
    // a chatty session would otherwise pay for both an append-stream AND
    // a redundant heartbeat per minute.
    if (Date.now() - s.lastPatchAt < HEARTBEAT_MS) return;
    s.lastPatchAt = Date.now();
    void fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ heartbeat: true }),
    })
      .then((res) => {
        logLine(sessionId, "heartbeat", { jobId, ok: res.ok, status: res.status });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logLine(sessionId, "heartbeat", { jobId, ok: false, error: msg });
      });
  };
  tick();
  s.heartbeatTimer = setInterval(tick, HEARTBEAT_MS);
  logLine(sessionId, "heartbeat-start", { jobId, intervalMs: HEARTBEAT_MS });
}

// =============================================================================
// Wire-event PATCH plumbing
// =============================================================================

type WireEvent =
  | { kind: "agent"; line: string; at?: number; stepRunId?: string | null }
  | { kind: "stderr"; line: string; at?: number; stepRunId?: string | null }
  | { kind: "exit"; code: number; at?: number; stepRunId?: string | null }
  | { kind: "user"; text: string; at?: number; stepRunId?: string | null };

function serializeWire(ev: WireEvent): string {
  const stamped = ev.at ? ev : { ...ev, at: Date.now() };
  return `${JSON.stringify(stamped)}\n`;
}

function sendPatch(
  s: Session,
  sessionId: string,
  body: Record<string, unknown>,
  tag: string,
): void {
  if (!s.jobId || !s.apiBaseUrl || !s.apiToken) return;
  const jobId = s.jobId;
  const url = `${s.apiBaseUrl}/api/desktop-jobs/${jobId}`;
  s.lastPatchAt = Date.now();
  void fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.apiToken}`,
    },
    body: JSON.stringify(body),
  })
    .then((res) => {
      if (!res.ok) logLine(sessionId, "patch", { tag, ok: false, status: res.status });
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(sessionId, "patch", { tag, ok: false, error: msg });
    });
}

function flushAppend(s: Session, sessionId: string): void {
  if (s.appendTimer) {
    clearTimeout(s.appendTimer);
    s.appendTimer = null;
  }
  if (s.appendBuffer.length === 0) return;
  const text = s.appendBuffer;
  s.appendBuffer = "";
  sendPatch(s, sessionId, { appendOutput: text }, "append");
}

function enqueueAppend(s: Session, sessionId: string, chunk: string): void {
  s.appendBuffer += chunk;
  if (s.appendBuffer.length >= APPEND_FLUSH_BYTES) {
    flushAppend(s, sessionId);
    return;
  }
  if (s.appendTimer) return;
  s.appendTimer = setTimeout(() => flushAppend(s, sessionId), APPEND_FLUSH_MS);
}

function patchTerminal(s: Session, sessionId: string, code: number): void {
  if (s.terminalSent) return;
  s.terminalSent = true;
  if (s.appendTimer) {
    clearTimeout(s.appendTimer);
    s.appendTimer = null;
  }
  const pending = s.appendBuffer;
  s.appendBuffer = "";
  const exitWire = serializeWire({
    kind: "exit",
    code,
    stepRunId: s.currentStepRunId,
  });
  const status: "SUCCEEDED" | "FAILED" | "CANCELED" = s.userStopped
    ? "CANCELED"
    : code === 0
      ? "SUCCEEDED"
      : "FAILED";
  sendPatch(s, sessionId, { appendOutput: pending + exitWire, status, exitCode: code }, "terminal");
}

function patchUserMessage(s: Session, sessionId: string, text: string): void {
  sendPatch(
    s,
    sessionId,
    {
      appendOutput: serializeWire({
        kind: "user",
        text,
        stepRunId: s.currentStepRunId,
      }),
    },
    "user",
  );
}

// =============================================================================
// Spawn + lifecycle
// =============================================================================

function userMessageFrame(text: string): string {
  return `${JSON.stringify({
    type: "user",
    message: { role: "user", content: text },
  })}\n`;
}

function spawnClaude(
  cwd: string,
  sessionId: string,
  opts: { resumeId?: string; ticket?: TicketContext },
): ChildProcess {
  const args = [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  if (opts.resumeId) args.push("--resume", opts.resumeId);
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (opts.ticket) {
    env.PLANBOOQ_API = opts.ticket.apiBaseUrl;
    env.PLANBOOQ_TOKEN = opts.ticket.apiToken;
    env.PLANBOOQ_TICKET_ID = opts.ticket.ticketId;
  }
  const proc = spawn("claude", args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  logLine(sessionId, "spawn", {
    cwd,
    args,
    pid: proc.pid,
    resume: opts.resumeId ?? null,
    ticketId: opts.ticket?.ticketId ?? null,
  });

  let buffer = "";
  proc.stdout?.on("data", (b: Buffer) => {
    buffer += b.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      logLine(sessionId, "stdout", line);
      emit({ type: "agent", sessionId, line });
      const s = sessions.get(sessionId);
      if (s) {
        enqueueAppend(
          s,
          sessionId,
          serializeWire({ kind: "agent", line, stepRunId: s.currentStepRunId }),
        );
      }
    }
  });
  proc.stderr?.on("data", (b: Buffer) => {
    const text = b.toString();
    logLine(sessionId, "stderr", text);
    emit({ type: "stderr", sessionId, line: text });
    const s = sessions.get(sessionId);
    if (s) {
      enqueueAppend(
        s,
        sessionId,
        serializeWire({ kind: "stderr", line: text, stepRunId: s.currentStepRunId }),
      );
    }
  });
  proc.on("error", (err: Error) => {
    logLine(sessionId, "spawn-error", { error: err.message });
    emit({ type: "stderr", sessionId, line: `[spawn error] ${err.message}\n` });
    const s = sessions.get(sessionId);
    if (s) {
      enqueueAppend(
        s,
        sessionId,
        serializeWire({
          kind: "stderr",
          line: `[spawn error] ${err.message}\n`,
          stepRunId: s.currentStepRunId,
        }),
      );
      clearHeartbeat(s);
      patchTerminal(s, sessionId, 1);
      sessions.delete(sessionId);
      closeLogStream(sessionId);
    }
  });
  proc.on("exit", (code: number | null) => {
    const exitCode = code ?? 0;
    logLine(sessionId, "exit", { code: exitCode });
    emit({ type: "exit", sessionId, code: exitCode });
    const s = sessions.get(sessionId);
    if (s) {
      clearHeartbeat(s);
      patchTerminal(s, sessionId, exitCode);
      sessions.delete(sessionId);
      closeLogStream(sessionId);
    }
  });

  return proc;
}

// =============================================================================
// Public API
// =============================================================================

export type StartParams = {
  worktreePath: string;
  firstMessage: string;
  ticket?: TicketContext;
  jobId?: string;
  workflowStepRunId?: string | null;
};

export function startSession(params: StartParams): { sessionId: string } {
  const sessionId = randomUUID();
  const proc = spawnClaude(params.worktreePath, sessionId, { ticket: params.ticket });
  const s: Session = {
    proc,
    cwd: params.worktreePath,
    ticketId: params.ticket?.ticketId ?? null,
    startedAt: Date.now(),
    jobId: params.jobId ?? null,
    apiBaseUrl: params.ticket?.apiBaseUrl ?? null,
    apiToken: params.ticket?.apiToken ?? null,
    heartbeatTimer: null,
    lastPatchAt: 0,
    appendBuffer: "",
    appendTimer: null,
    userStopped: false,
    terminalSent: false,
    currentStepRunId: params.workflowStepRunId ?? null,
  };
  sessions.set(sessionId, s);
  if (s.jobId && s.apiBaseUrl && s.apiToken) startHeartbeat(s, sessionId);
  proc.stdin?.write(userMessageFrame(params.firstMessage));
  patchUserMessage(s, sessionId, params.firstMessage);
  return { sessionId };
}

export type ResumeParams = {
  worktreePath: string;
  claudeSessionId: string;
  message: string;
  ticket?: TicketContext;
  jobId?: string;
  workflowStepRunId?: string | null;
};

export function resumeSession(params: ResumeParams): { sessionId: string } {
  const sessionId = randomUUID();
  const proc = spawnClaude(params.worktreePath, sessionId, {
    resumeId: params.claudeSessionId,
    ticket: params.ticket,
  });
  const s: Session = {
    proc,
    cwd: params.worktreePath,
    ticketId: params.ticket?.ticketId ?? null,
    startedAt: Date.now(),
    jobId: params.jobId ?? null,
    apiBaseUrl: params.ticket?.apiBaseUrl ?? null,
    apiToken: params.ticket?.apiToken ?? null,
    heartbeatTimer: null,
    lastPatchAt: 0,
    appendBuffer: "",
    appendTimer: null,
    userStopped: false,
    terminalSent: false,
    currentStepRunId: params.workflowStepRunId ?? null,
  };
  sessions.set(sessionId, s);
  if (s.jobId && s.apiBaseUrl && s.apiToken) startHeartbeat(s, sessionId);
  proc.stdin?.write(userMessageFrame(params.message));
  patchUserMessage(s, sessionId, params.message);
  return { sessionId };
}

export function sendToSession(
  sessionId: string,
  message: string,
  workflowStepRunId?: string | null,
): { ok: boolean; error?: string } {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, error: "session not found" };
  if (workflowStepRunId !== undefined) {
    s.currentStepRunId = workflowStepRunId;
  }
  s.proc.stdin?.write(userMessageFrame(message));
  patchUserMessage(s, sessionId, message);
  return { ok: true };
}

export function stopSession(sessionId: string): { ok: boolean; error?: string } {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, error: "session not found" };
  logLine(sessionId, "stop", { source: "user" });
  s.userStopped = true;
  clearHeartbeat(s);
  s.proc.kill();
  return { ok: true };
}

export function listSessions(): SessionInfo[] {
  const out: SessionInfo[] = [];
  for (const [sessionId, s] of sessions) {
    out.push({
      sessionId,
      ticketId: s.ticketId,
      jobId: s.jobId,
      cwd: s.cwd,
      startedAt: s.startedAt,
      busy: !s.terminalSent && !s.proc.killed,
    });
  }
  return out;
}

export function findSessionByTicket(ticketId: string): string | null {
  for (const [sessionId, s] of sessions) {
    if (s.ticketId === ticketId && !s.terminalSent) return sessionId;
  }
  return null;
}

// Oneshot: classification helper. No session bookkeeping; spawn, write, drain,
// exit. Used by the server for cheap LLM calls.
export function oneshot(
  prompt: string,
  timeoutMs: number,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn("claude", ["--print", "--output-format", "text"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let out = "";
    let err = "";
    let settled = false;
    const settle = (v: { ok: boolean; text?: string; error?: string }): void => {
      if (settled) return;
      settled = true;
      try {
        proc.kill();
      } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => settle({ ok: false, error: "timeout" }), timeoutMs);
    proc.stdout?.on("data", (b: Buffer) => {
      out += b.toString();
    });
    proc.stderr?.on("data", (b: Buffer) => {
      err += b.toString();
    });
    proc.on("error", (e: Error) => {
      clearTimeout(timer);
      settle({ ok: false, error: e.message });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) settle({ ok: true, text: out.trim() });
      else settle({ ok: false, error: `exit ${code}: ${err.trim().slice(0, 200)}` });
    });
    try {
      proc.stdin?.write(prompt);
      proc.stdin?.end();
    } catch (e) {
      clearTimeout(timer);
      settle({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

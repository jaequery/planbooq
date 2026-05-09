"use client";

import { type AgentEvent, getDesktopBridge } from "@/lib/use-is-desktop";

/**
 * Routes desktop bridge `AgentEvent`s to the right `AgentJob` via PATCH so
 * persistence + Ably fanout keep happening even when the ticket panel that
 * started the session is unmounted (user closed the dialog or switched
 * tickets). The Electron main process keeps the underlying `claude` child
 * process alive regardless of which renderer view is showing.
 *
 * Flow:
 *   - DesktopPanel calls `agentStart`, receives a sessionId, opens an
 *     AgentJob row server-side, then calls `registerAgentSession`.
 *   - This module owns a single bridge subscription. For every event whose
 *     sessionId is registered, it serializes to the same wire format the
 *     panel uses and PATCHes /api/desktop-jobs/:jobId.
 *   - On `exit`, status flips to SUCCEEDED/FAILED and the registration is
 *     dropped.
 */

type Registration = {
  jobId: string;
  workspaceId: string;
  ticketId: string;
};

type WireEvent =
  | { kind: "agent"; line: string }
  | { kind: "stderr"; line: string }
  | { kind: "exit"; code: number }
  | { kind: "user"; text: string };

const sessions = new Map<string, Registration>();
let started = false;

// Coalesce per-line appendOutput into ~250ms batches so a chatty `claude`
// process doesn't issue 10+ PATCH/sec (each = Prisma read+write + Ably publish).
const FLUSH_MS = 250;
const buffers = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> | null }>();

function serializeWire(ev: WireEvent): string {
  return `${JSON.stringify(ev)}\n`;
}

function patchJob(
  jobId: string,
  body: {
    appendOutput?: string;
    status?: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
    exitCode?: number;
  },
): void {
  void fetch(`/api/desktop-jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

function flushBuffer(jobId: string): void {
  const buf = buffers.get(jobId);
  if (!buf) return;
  if (buf.timer) clearTimeout(buf.timer);
  buffers.delete(jobId);
  if (buf.text.length > 0) patchJob(jobId, { appendOutput: buf.text });
}

function enqueueAppend(jobId: string, chunk: string): void {
  const existing = buffers.get(jobId);
  if (existing) {
    existing.text += chunk;
    return;
  }
  const entry: { text: string; timer: ReturnType<typeof setTimeout> | null } = {
    text: chunk,
    timer: null,
  };
  entry.timer = setTimeout(() => flushBuffer(jobId), FLUSH_MS);
  buffers.set(jobId, entry);
}

function handle(e: AgentEvent): void {
  const reg = sessions.get(e.sessionId);
  if (!reg) return;
  const wire: WireEvent =
    e.type === "exit"
      ? { kind: "exit", code: e.code }
      : e.type === "stderr"
        ? { kind: "stderr", line: e.line }
        : { kind: "agent", line: e.line };

  if (e.type === "exit") {
    // Flush any pending output together with the exit marker, then send the
    // terminal status as a separate PATCH so finishedAt/exitCode land promptly.
    const buf = buffers.get(reg.jobId);
    const pending = buf?.text ?? "";
    if (buf?.timer) clearTimeout(buf.timer);
    buffers.delete(reg.jobId);
    patchJob(reg.jobId, { appendOutput: pending + serializeWire(wire) });
    patchJob(reg.jobId, {
      status: e.code === 0 ? "SUCCEEDED" : "FAILED",
      exitCode: e.code,
    });
    sessions.delete(e.sessionId);
    return;
  }

  enqueueAppend(reg.jobId, serializeWire(wire));
}

/** Idempotent. Mounted once at workspace layout via <AgentSessionManager />. */
export function startAgentSessionManager(): () => void {
  if (started) return () => undefined;
  const bridge = getDesktopBridge();
  if (!bridge || typeof bridge.onAgentEvent !== "function") return () => undefined;
  started = true;
  const unsubscribe = bridge.onAgentEvent(handle);
  return () => {
    started = false;
    sessions.clear();
    for (const buf of buffers.values()) if (buf.timer) clearTimeout(buf.timer);
    buffers.clear();
    try {
      unsubscribe();
    } catch {}
  };
}

export function registerAgentSession(sessionId: string, reg: Registration): void {
  sessions.set(sessionId, reg);
}

export function unregisterAgentSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function isAgentSessionRegistered(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/**
 * Look up the live sessionId for a ticket, if any. Used by DesktopPanel on
 * remount to re-attach Stop/Send to an in-flight session that the previous
 * dialog instance started — without this, the panel would show "thinking…"
 * with disabled controls (the zombie-window).
 */
export function getAgentSessionByTicket(ticketId: string): string | null {
  for (const [sessionId, reg] of sessions) {
    if (reg.ticketId === ticketId) return sessionId;
  }
  return null;
}

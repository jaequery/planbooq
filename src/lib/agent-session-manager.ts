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

function handle(e: AgentEvent): void {
  const reg = sessions.get(e.sessionId);
  if (!reg) return;
  const wire: WireEvent =
    e.type === "exit"
      ? { kind: "exit", code: e.code }
      : e.type === "stderr"
        ? { kind: "stderr", line: e.line }
        : { kind: "agent", line: e.line };

  patchJob(reg.jobId, { appendOutput: serializeWire(wire) });

  if (e.type === "exit") {
    patchJob(reg.jobId, {
      status: e.code === 0 ? "SUCCEEDED" : "FAILED",
      exitCode: e.code,
    });
    sessions.delete(e.sessionId);
  }
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

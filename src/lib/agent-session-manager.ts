"use client";

/**
 * Tracks which AgentJob each desktop session belongs to so the ticket panel
 * can re-attach to an in-flight session on remount (zombie-window guard).
 *
 * Persistence lives entirely in Electron main now — see
 * apps/desktop/src/lib/agent.ts. Main owns the `claude` child handle and
 * PATCHes every stdout/stderr line, the exit event, and bridge heartbeats
 * directly to /api/desktop-jobs/:jobId with Bearer auth. The renderer is a
 * viewer: it receives the same events via IPC for live UI rendering, but it
 * is not in the critical path for saving messages.
 *
 * Previously this module forwarded bridge events to PATCHes from the
 * renderer; that path lost wire lines when the user closed a ticket dialog
 * mid-session (forensics on NEWP-U00NQS showed 90 wire lines in main's log,
 * 11 in AgentJob.output). Moving the PATCH to main eliminates the renderer
 * as a single point of failure for persistence.
 */

type Registration = {
  jobId: string;
  workspaceId: string;
  ticketId: string;
};

const sessions = new Map<string, Registration>();

/**
 * No-op compatibility shim. The workspace layout still mounts
 * <AgentSessionManager /> which calls this; keep returning a teardown
 * fn so callers don't need to know the persistence path moved.
 */
export function startAgentSessionManager(): () => void {
  return () => {
    sessions.clear();
  };
}

export function registerAgentSession(sessionId: string, reg: Registration): void {
  sessions.set(sessionId, reg);
}

export function unregisterAgentSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * userStopped intent now lives on the Session in Electron main — set by the
 * `planbooq:agent:stop` IPC handler before it kills the child, and read by
 * main's exit handler to classify the terminal PATCH as CANCELED vs FAILED.
 * This function is kept as a no-op so the panel's existing call site stays
 * compile-clean; removing the call would be a follow-up cleanup.
 */
export function markSessionStoppedByUser(_sessionId: string): void {
  // No-op: see Electron main's `planbooq:agent:stop` handler.
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

/**
 * Return every registered sessionId for a ticket. Used by the workspace-level
 * `ticket.workflow.completed` listener so it can stop every CLI bound to the
 * ticket, not just the first match — warm-send chains can register multiple
 * sessions over a workflow's lifetime.
 */
export function getRegisteredSessionsForTicket(ticketId: string): string[] {
  const out: string[] = [];
  for (const [sessionId, reg] of sessions) {
    if (reg.ticketId === ticketId) out.push(sessionId);
  }
  return out;
}

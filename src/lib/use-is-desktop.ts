"use client";

import { useEffect, useState } from "react";

export type AgentEvent =
  | { type: "agent"; sessionId: string; line: string }
  | { type: "stderr"; sessionId: string; line: string }
  | { type: "exit"; sessionId: string; code: number };

type DesktopBridge = {
  spawnWorktree: (input: {
    repoPath: string;
    branch: string;
    prompt: string;
    ticketIdentifier: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    worktreePath?: string;
    branch?: string;
  }>;
  pickRepoPath: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  onWorktreeLog: (cb: (line: string) => void) => () => void;
  agentStart: (input: {
    repoPath: string;
    branch: string;
    firstMessage: string;
    ticket?: {
      ticketId: string;
      identifier: string;
      title: string;
      apiBaseUrl: string;
      apiToken: string;
    };
    attachments?: Array<{ id: string; ext: string; base64: string }>;
    /** AgentJob id, created server-side BEFORE calling agentStart. When
     *  present alongside ticket.apiBaseUrl + apiToken, Electron main starts
     *  HTTP heartbeats every 30s so the server reaper knows the bridge is
     *  alive even when the renderer isn't actively pushing wire events. */
    jobId?: string;
    /** WorkflowStepRun id reserved by the workflow panel before dispatch.
     *  Electron main stamps it onto every wire event for this session so
     *  the server-side mirror can attribute each Message row to its step. */
    workflowStepRunId?: string | null;
  }) => Promise<{
    ok: boolean;
    error?: string;
    sessionId?: string;
    worktreePath?: string;
  }>;
  agentResume: (input: {
    worktreePath: string;
    claudeSessionId: string;
    message: string;
    ticket?: {
      ticketId: string;
      identifier: string;
      title: string;
      apiBaseUrl: string;
      apiToken: string;
    };
    jobId?: string;
    workflowStepRunId?: string | null;
  }) => Promise<{ ok: boolean; error?: string; sessionId?: string }>;
  agentSend: (input: {
    sessionId: string;
    message: string;
    /** Set when the renderer is dispatching a new workflow step on an
     *  already-live session. Main updates the per-session step stamp before
     *  writing this user wire event so subsequent agent/tool messages get
     *  the new step credited correctly. */
    workflowStepRunId?: string | null;
  }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  agentStop: (input: { sessionId: string }) => Promise<{ ok: boolean; error?: string }>;
  agentOneshot?: (input: { prompt: string; timeoutMs?: number }) => Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }>;
  /** Cold-mount reattach: ask the broker whether a live session exists for
   *  this ticket. Returns the sessionId we can subscribe to, or null. */
  agentFindSessionByTicket?: (input: {
    ticketId: string;
  }) => Promise<{ ok: true; sessionId: string | null } | { ok: false; error: string }>;
  onAgentEvent: (cb: (e: AgentEvent) => void) => () => void;
  readProjectFile?: (input: {
    repoPath: string;
    relPath: string;
  }) => Promise<{ ok: boolean; content?: string; exists?: boolean; error?: string }>;
  writeProjectFile?: (input: {
    repoPath: string;
    relPath: string;
    content: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  saveClipboardImage?: (input: {
    dataBase64: string;
    ext: string;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  writeAttachments?: (input: {
    worktreePath: string;
    items: Array<{ id: string; ext: string; base64: string }>;
  }) => Promise<
    { ok: true; items: Array<{ id: string; relPath: string }> } | { ok: false; error: string }
  >;
  pullMain?: (input: {
    repoPath: string;
  }) => Promise<
    { ok: true; branch: string; updated: boolean; output: string } | { ok: false; error: string }
  >;
  removeWorktree?: (input: {
    repoPath: string;
    worktreePath: string;
    branch?: string | null;
  }) => Promise<
    | { ok: true; removedWorktree: boolean; removedBranch: boolean }
    | { ok: false; removedWorktree: false; removedBranch: false; error: string }
  >;
};

declare global {
  interface Window {
    planbooq?: DesktopBridge;
  }
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && !!window.planbooq);
  }, []);
  return isDesktop;
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.planbooq ?? null;
}

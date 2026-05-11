"use client";

import { useEffect, useState } from "react";

export type AgentEvent =
  | { type: "agent"; sessionId: string; line: string }
  | { type: "stderr"; sessionId: string; line: string }
  | { type: "exit"; sessionId: string; code: number };

type DesktopBridge = {
  spawnWorktree: (input: { repoPath: string; branch: string; prompt: string; ticketIdentifier: string }) => Promise<{
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
  }) => Promise<{ ok: boolean; error?: string; sessionId?: string }>;
  agentSend: (input: { sessionId: string; message: string }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  agentStop: (input: { sessionId: string }) => Promise<{ ok: boolean; error?: string }>;
  agentOneshot?: (input: { prompt: string; timeoutMs?: number }) => Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }>;
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
    | { ok: true; items: Array<{ id: string; relPath: string }> }
    | { ok: false; error: string }
  >;
  pullMain?: (input: {
    repoPath: string;
  }) => Promise<
    { ok: true; branch: string; updated: boolean; output: string } | { ok: false; error: string }
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

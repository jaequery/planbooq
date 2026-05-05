"use client";

import { useEffect, useState } from "react";

export type AgentEvent =
  | { type: "agent"; sessionId: string; line: string }
  | { type: "stderr"; sessionId: string; line: string }
  | { type: "exit"; sessionId: string; code: number };

type DesktopBridge = {
  spawnWorktree: (input: { repoPath: string; branch: string; prompt: string }) => Promise<{
    ok: boolean;
    error?: string;
    worktreePath?: string;
    branch?: string;
  }>;
  pickRepoPath: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  onWorktreeLog: (cb: (line: string) => void) => () => void;
  agentStart: (input: { repoPath: string; branch: string; firstMessage: string }) => Promise<{
    ok: boolean;
    error?: string;
    sessionId?: string;
    worktreePath?: string;
  }>;
  agentResume: (input: {
    worktreePath: string;
    claudeSessionId: string;
    message: string;
  }) => Promise<{ ok: boolean; error?: string; sessionId?: string }>;
  agentSend: (input: { sessionId: string; message: string }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  agentStop: (input: { sessionId: string }) => Promise<{ ok: boolean; error?: string }>;
  onAgentEvent: (cb: (e: AgentEvent) => void) => () => void;
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

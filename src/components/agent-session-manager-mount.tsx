"use client";

import { useEffect } from "react";
import { startAgentSessionManager } from "@/lib/agent-session-manager";

/**
 * Mounts the global desktop agent session listener. Lives at the workspace
 * layout so it survives ticket dialog open/close and project navigation.
 */
export function AgentSessionManagerMount(): null {
  useEffect(() => startAgentSessionManager(), []);
  return null;
}

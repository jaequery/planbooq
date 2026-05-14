"use client";

import { useCallback } from "react";
import {
  getAgentSessionByTicket,
  getRegisteredSessionsForTicket,
} from "@/lib/agent-session-manager";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";
import { getDesktopBridge } from "@/lib/use-is-desktop";

/**
 * Workspace-level subscriber for `ticket.workflow.completed` (PLAN-RPL4OB).
 * Survives ticket-dialog open/close because it mounts in the workspace
 * layout alongside <AgentSessionManagerMount>. When the server finalizes a
 * WorkflowRun, this stops every desktop CLI bound to the run so we stop
 * leaking processes per merged ticket.
 *
 * Server-side AgentJob cleanup happens unconditionally in
 * workflow-commander's `finalizeRunCleanup`; this listener is purely
 * best-effort process cleanup on machines that have the desktop bridge
 * loaded (browser-only tabs no-op).
 */
export function AgentSessionGlobalListener({ workspaceId }: { workspaceId: string }): null {
  const onEvent = useCallback((event: AblyChannelEvent) => {
    if (event.name !== "ticket.workflow.completed") return;
    const bridge = getDesktopBridge();
    if (!bridge?.agentStop) return;

    const targets = new Set<string>(event.sessionIds);
    // Fallback: catch any sessions the renderer registered for this ticket
    // whose claudeSessionId never made it into AgentJob (race between
    // bridge.agentStart returning and the desktop-jobs PATCH landing).
    for (const sid of getRegisteredSessionsForTicket(event.ticketId)) {
      targets.add(sid);
    }
    const single = getAgentSessionByTicket(event.ticketId);
    if (single) targets.add(single);

    for (const sessionId of targets) {
      void bridge.agentStop({ sessionId }).catch(() => undefined);
    }
  }, []);

  useBoardChannel(workspaceId, onEvent);
  return null;
}

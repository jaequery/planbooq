"use client";

import { useCallback } from "react";
import {
  claimWorkflowDispatch,
  getAgentSessionByTicket,
  getRegisteredSessionsForTicket,
  releaseWorkflowDispatchClaim,
} from "@/lib/agent-session-manager";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";
import { getDesktopBridge } from "@/lib/use-is-desktop";

/**
 * Workspace-level subscriber for `ticket.workflow.completed` (PLAN-RPL4OB)
 * AND `ticket.workflow.dispatch`. Mounts in the workspace layout so it
 * survives ticket-dialog open/close.
 *
 * **Completed** → stops every desktop CLI bound to the run, so we stop
 * leaking processes per merged ticket. Server-side AgentJob cleanup happens
 * unconditionally in workflow-commander's `finalizeRunCleanup`; this
 * listener is purely best-effort process cleanup on machines that have the
 * desktop bridge loaded (browser-only tabs no-op).
 *
 * **Dispatch** → warm-sends the next step's prompt into the still-alive
 * Claude CLI for any ticket with a registered session, EVEN WHEN THE TICKET
 * PANEL IS CLOSED. Without this, mid-workflow dispatches were silently
 * dropped (autonomous Plan→Build sat at "Build RUNNING" server-side with no
 * actual progress until the user manually opened the dialog and the
 * per-panel missed-dispatch recovery fired — PLAN-RPL4OB forensics: 4m25s
 * gap from STEP_STARTED:Build to the Build AgentJob actually being created).
 *
 * Dedup with the per-panel handler runs through `claimWorkflowDispatch` —
 * whichever subscriber fires first wins the slot. The panel handler exists
 * because it also drives panel-local UI state (busy, queue) that the global
 * handler doesn't need; both are safe to keep as long as they share the
 * claim set.
 */
export function AgentSessionGlobalListener({ workspaceId }: { workspaceId: string }): null {
  const onEvent = useCallback((event: AblyChannelEvent) => {
    if (event.name === "ticket.workflow.completed") {
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
      return;
    }

    if (event.name === "ticket.workflow.dispatch") {
      if (!claimWorkflowDispatch(event.stepRunId)) return;

      void (async () => {
        let claimReleased = false;
        const release = () => {
          if (!claimReleased) {
            releaseWorkflowDispatchClaim(event.stepRunId);
            claimReleased = true;
          }
        };
        try {
          const sessionId = getAgentSessionByTicket(event.ticketId);
          if (!sessionId) {
            // No live session — cold dispatch (first step of a workflow) or
            // the CLI exited. The per-panel handler's missed-dispatch
            // recovery (getRunningWorkflowDispatchForTicketAction) will pick
            // this up when the user opens the dialog. Release so it can
            // re-claim.
            release();
            return;
          }
          const bridge = getDesktopBridge();
          if (!bridge || typeof bridge.agentSend !== "function") {
            release();
            return;
          }

          // Same shape as ticket-agent-panel.tsx's warm-send path
          // (line 1556-1591): create the AgentJob row so wire events have
          // somewhere to land, then push the prompt onto the warm Claude.
          const res = await fetch(`/api/tickets/${event.ticketId}/desktop-jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: event.prompt,
              workflowStepRunId: event.stepRunId,
              claudeSessionId: sessionId,
              kind: "CHAT",
            }),
          });
          if (!res.ok) {
            release();
            return;
          }
          const send = await bridge.agentSend({
            sessionId,
            message: event.prompt,
            workflowStepRunId: event.stepRunId,
          });
          if (!send.ok) release();
        } catch {
          release();
        }
      })();
      return;
    }
  }, []);

  useBoardChannel(workspaceId, onEvent);
  return null;
}

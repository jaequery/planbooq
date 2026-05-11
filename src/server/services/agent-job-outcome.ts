import "server-only";

import type { AgentJobOutcome, AgentJobStatus } from "@prisma/client";

// =============================================================================
// Outcome classification for AgentJob runs.
//
// Process-level `status` (SUCCEEDED/FAILED/CANCELED) is a poor signal for the
// chat UI: a run can SUCCEED at the OS level but emit zero visible output,
// leaving the conversation thread looking deceptively empty when the user
// reopens the ticket. We capture that distinction as `outcome` so the mirror
// layer can render a clear "no output" marker instead of silence.
//
// Inspired by Paperclip's RunLivenessState (see
// ~/Sites/paperclip/server/src/services/run-liveness.ts). Scoped down to the
// three values Planbooq actually needs today; new values can be added as the
// agent surface grows (e.g. BLOCKED if we ever detect server-side that the
// agent stopped to ask the user something).
// =============================================================================

export type ClassifyInput = {
  status: AgentJobStatus;
  // Signals harvested from the WireJobState by the mirror layer.
  textChars: number;
  toolUses: number;
};

export type ClassifyOutput = {
  outcome: AgentJobOutcome;
  reason: string;
};

export function classifyAgentJobOutcome(input: ClassifyInput): ClassifyOutput {
  const { status, textChars, toolUses } = input;

  if (status === "FAILED" || status === "CANCELED") {
    return {
      outcome: "FAILED",
      reason:
        status === "CANCELED" ? "Run was canceled before completion" : "Run ended in FAILED state",
    };
  }

  if (status === "SUCCEEDED") {
    if (textChars <= 0 && toolUses <= 0) {
      return {
        outcome: "EMPTY_RESPONSE",
        reason:
          "Run ended cleanly but produced no visible output (no text and no tool use). This usually means the agent process exited before the model emitted a turn — e.g. an early hook failure, an auth error, or a sandbox restriction.",
      };
    }
    return {
      outcome: "COMPLETED",
      reason: `Run produced ${textChars} character${textChars === 1 ? "" : "s"} of text and ${toolUses} tool call${toolUses === 1 ? "" : "s"}`,
    };
  }

  // PENDING/RUNNING shouldn't reach a terminal classifier — fall through as
  // FAILED rather than throw, so we never break the mirror pipeline.
  return {
    outcome: "FAILED",
    reason: `Unexpected non-terminal status at classification time: ${status}`,
  };
}

// Body rendered into the SYSTEM Message inserted when outcome=EMPTY_RESPONSE.
// Plain-text, vibe-coder-friendly, ends with a concrete next action. Keep
// stable — clients may match on prefix for future Retry affordances.
export function emptyResponseMessageBody(reason: string): string {
  return [
    "**No response from agent.**",
    "",
    "The run ended without producing any output. This usually means the agent process exited before the model could reply (early hook failure, auth error, or a sandbox restriction).",
    "",
    `_Details: ${reason}_`,
    "",
    "Send the prompt again to retry, or edit the ticket and try a different approach.",
  ].join("\n");
}

import "server-only";

import { z } from "zod";
import type { ServerActionResult } from "@/lib/types";
import { prisma } from "@/server/db";
import { workflowCommander } from "@/server/services/workflow-commander";

/**
 * `POST /api/v1/workflow-runs/:runId/finish` — the agent's structured
 * step-finish call. Replaces the legacy `autonomous` ticket label as the
 * gate for "should the next step auto-dispatch?".
 *
 * The next-action vocabulary maps onto the persisted `StepDecision` enum
 * (`WorkflowStepRun.decision`):
 *
 *   - `auto`  → AUTO  : server fires `dispatchNextWorkflowStep` on
 *                       turn-end.
 *   - `block` → BLOCK : server demotes the ticket to Blocked and waits
 *                       for a human Run click.
 *   - `ship`  → SHIP  : reserved for the future consolidation with
 *                       `pbq ship` (PR opened → Review). Until that
 *                       lands, the agent is expected to keep calling
 *                       `pbq ship` and only emit `ship` here for
 *                       attribution; the gate treats `SHIP` as
 *                       "no auto-chain" (same as `block`).
 *
 * Idempotent: re-applying the same decision is a no-op. A different
 * decision on a step that already has one fails with `decision_conflict`
 * so accidental double-finishes (warm-sends, retries) surface instead of
 * silently flipping the gate.
 */
export const FinishWorkflowStepSchema = z
  .object({
    stepRunId: z.string().min(1),
    next: z.enum(["auto", "block", "ship"]),
  })
  .strict();

export type FinishWorkflowStepInput = z.infer<typeof FinishWorkflowStepSchema>;

const NEXT_TO_DECISION = {
  auto: "AUTO",
  block: "BLOCK",
  ship: "SHIP",
} as const;

export async function finishWorkflowStepSvc(
  userId: string,
  runId: string,
  input: unknown,
): Promise<
  ServerActionResult<{
    runId: string;
    stepRunId: string;
    decision: "AUTO" | "BLOCK" | "SHIP";
    alreadyFinished: boolean;
  }>
> {
  const parsed = FinishWorkflowStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_error" };
  const { stepRunId, next } = parsed.data;

  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { id: true, workspaceId: true, stepRuns: { select: { id: true } } },
  });
  if (!run) return { ok: false, error: "not_found" };

  // The stepRunId must belong to the run named in the URL — otherwise a
  // caller could trivially write a decision on any step in any workspace
  // they happen to have access to by guessing run IDs.
  if (!run.stepRuns.some((s) => s.id === stepRunId)) {
    return { ok: false, error: "not_found" };
  }

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: run.workspaceId, userId } },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "forbidden" };

  const result = await workflowCommander.finishStep({
    stepRunId,
    decision: NEXT_TO_DECISION[next],
    byUserId: userId,
  });
  if (!result.ok) {
    return { ok: false, error: result.reason };
  }
  return {
    ok: true,
    data: {
      runId,
      stepRunId,
      decision: NEXT_TO_DECISION[next],
      alreadyFinished: result.alreadyFinished,
    },
  };
}

/**
 * Ticket-scoped convenience: resolves the currently-running step on the
 * ticket and finishes it. This is what `pbq workflow finish` hits so the
 * wrapper script doesn't need to discover the runId/stepRunId itself.
 *
 * The endpoint expects exactly one RUNNING step on the ticket — if none
 * exist (workflow already completed, or never started) it returns
 * `no_running_step`. If multiple exist (which shouldn't happen given
 * `dispatchNextStep`'s "step_already_running" guard, but the data model
 * permits it across distinct runs) it picks the most-recently-started
 * one and finishes that.
 */
export const FinishCurrentStepSchema = z
  .object({
    next: z.enum(["auto", "block", "ship"]),
  })
  .strict();

export type FinishCurrentStepInput = z.infer<typeof FinishCurrentStepSchema>;

export async function finishCurrentWorkflowStepForTicketSvc(
  userId: string,
  ticketId: string,
  input: unknown,
): Promise<
  ServerActionResult<{
    runId: string;
    stepRunId: string;
    stepName: string;
    decision: "AUTO" | "BLOCK" | "SHIP";
    alreadyFinished: boolean;
  }>
> {
  const parsed = FinishCurrentStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_error" };
  const { next } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return { ok: false, error: "ticket_not_found" };

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: ticket.workspaceId, userId } },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "forbidden" };

  const runningStep = await prisma.workflowStepRun.findFirst({
    where: {
      status: "RUNNING",
      run: { ticketId, status: "RUNNING" },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, name: true, runId: true },
  });
  if (!runningStep) return { ok: false, error: "no_running_step" };

  const result = await workflowCommander.finishStep({
    stepRunId: runningStep.id,
    decision: NEXT_TO_DECISION[next],
    byUserId: userId,
  });
  if (!result.ok) {
    return { ok: false, error: result.reason };
  }
  return {
    ok: true,
    data: {
      runId: runningStep.runId,
      stepRunId: runningStep.id,
      stepName: runningStep.name,
      decision: NEXT_TO_DECISION[next],
      alreadyFinished: result.alreadyFinished,
    },
  };
}

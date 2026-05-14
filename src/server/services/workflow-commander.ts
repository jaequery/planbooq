import "server-only";

import type { Prisma, StepDecision, TicketActivityKind, WorkflowRunStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

type WorkflowStepInput = {
  name: string;
  prompt: string;
};

type StepActivityPayload = {
  name?: string;
  byUserId: string | null;
  result?: "success" | "failure";
  error?: string;
};

type WorkflowStepRunSnapshot = {
  id: string;
  runId: string;
  name: string;
  prompt: string;
  position: number;
  run: {
    id: string;
    ticketId: string;
    workspaceId: string;
  };
};

export function withWorkflowStepBoundary(args: {
  stepName: string;
  position: number;
  total: number;
  prompt: string;
}): string {
  const isLast = args.position + 1 >= args.total;
  return [
    `You are executing exactly one Planbooq workflow step: "${args.stepName}" (${args.position + 1}/${args.total}).`,
    "",
    "Hard boundary rules:",
    "- Do only the work requested by this step's prompt.",
    "- Do not begin, preview, implement, commit, push, open a PR, ship, or otherwise perform any later workflow step unless this step's prompt explicitly asks for that exact action.",
    "- When this step is complete, say what you completed and then stop. Do not continue into the next step. Planbooq will dispatch the next workflow step in a separate prompt.",
    "- If the next step seems obvious, still stop and wait for Planbooq to dispatch it.",
    "",
    "Step-finish decision (REQUIRED — replaces the legacy `autonomous` label):",
    "Before stopping, you MUST call `./.planbooq/pbq workflow finish` with one of:",
    '  - `{"next":"auto"}`  → tell Planbooq to auto-dispatch the next step',
    "                          (use only for low-risk continuations where you don't",
    "                          need a human to look at the result first).",
    '  - `{"next":"block"}` → stop here; the ticket lands in Blocked and waits',
    "                          for a human to click Run.",
    '  - `{"next":"ship"}`  → you\'re about to call `pbq ship` (PR-flow path).',
    "                          Use this on the Issue-PR step or whenever the",
    "                          terminal call is `pbq ship`.",
    'Prose like "Autonomy decision: YES" is ignored — only the tool call counts.',
    isLast
      ? 'This is the last step; `next:"auto"` here is a no-op (no further step exists).'
      : "Pick `auto` deliberately — it skips human review of this step's output.",
    "",
    args.prompt,
  ].join("\n");
}

/** If Ably missed `ticket.workflow.dispatch`, the client can fetch the same
 *  prompt payload for the authoritative RUNNING step. */
export async function getRunningWorkflowDispatchForTicket(
  ticketId: string,
): Promise<{ runId: string; stepRunId: string; prompt: string } | null> {
  const run = await prisma.workflowRun.findFirst({
    where: { ticketId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      stepRuns: {
        where: { status: "RUNNING" },
        orderBy: { position: "asc" },
        take: 1,
        select: { id: true, name: true, prompt: true, position: true },
      },
    },
  });
  const step = run?.stepRuns[0];
  if (!run || !step) return null;
  const total = await prisma.workflowStepRun.count({ where: { runId: run.id } });
  return {
    runId: run.id,
    stepRunId: step.id,
    prompt: withWorkflowStepBoundary({
      stepName: step.name,
      position: step.position,
      total,
      prompt: step.prompt,
    }),
  };
}

async function publishActivity(args: {
  workspaceId: string;
  ticketId: string;
  activity: {
    id: string;
    kind: TicketActivityKind;
    payload: Prisma.JsonValue;
    jobId: string | null;
    createdAt: Date;
  };
}): Promise<void> {
  await publishWorkspaceEvent(args.workspaceId, {
    name: "ticket.activity",
    workspaceId: args.workspaceId,
    ticketId: args.ticketId,
    activity: {
      id: args.activity.id,
      kind: args.activity.kind,
      payload: args.activity.payload as Record<string, unknown>,
      jobId: args.activity.jobId,
      createdAt: args.activity.createdAt.toISOString(),
    },
  });
}

async function createStepActivity(args: {
  workflowStepRunId: string;
  kind: "STEP_STARTED" | "STEP_COMPLETED";
  jobId?: string | null;
  payload: StepActivityPayload;
}): Promise<{
  ticketId: string;
  workspaceId: string;
  activity: {
    id: string;
    kind: TicketActivityKind;
    payload: Prisma.JsonValue;
    jobId: string | null;
    createdAt: Date;
  };
} | null> {
  return prisma.$transaction(async (tx) => {
    const stepRun = await tx.workflowStepRun.findUnique({
      where: { id: args.workflowStepRunId },
      select: {
        id: true,
        name: true,
        run: { select: { ticketId: true, workspaceId: true } },
      },
    });
    if (!stepRun) return null;

    const existing = await tx.ticketActivity.findFirst({
      where: { workflowStepRunId: stepRun.id, kind: args.kind },
      select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
    });
    if (existing) {
      return {
        ticketId: stepRun.run.ticketId,
        workspaceId: stepRun.run.workspaceId,
        activity: existing,
      };
    }

    const payload = { ...args.payload, name: args.payload.name ?? stepRun.name };
    const activity = await tx.ticketActivity.create({
      data: {
        ticketId: stepRun.run.ticketId,
        workspaceId: stepRun.run.workspaceId,
        workflowStepRunId: stepRun.id,
        jobId: args.jobId ?? null,
        kind: args.kind,
        payload: payload as Prisma.InputJsonValue,
      },
      select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
    });
    return {
      ticketId: stepRun.run.ticketId,
      workspaceId: stepRun.run.workspaceId,
      activity,
    };
  });
}

/**
 * Cleanup the desktop side after the run flips to SUCCEEDED. Runs once per
 * finalization (gated by the CAS in `dispatchNextStep`):
 *
 *  - Reap any AgentJob still RUNNING on this run via status-CAS so the
 *    90s `agent went stale` reaper doesn't have to wait on bridge
 *    heartbeats to finally stop (the bug — see PLAN-RPL4OB).
 *  - Mirror each transitioned job's terminal state through `mirrorJobTerminal`
 *    so wire messages get `status: CANCELED`, the linked TicketActivity is
 *    written, and Ably `agent.delta` echos to anything still listening.
 *  - Publish `ticket.workflow.completed` carrying the distinct claudeSessionIds
 *    so the workspace-level desktop listener can call `bridge.agentStop` on
 *    the now-idle CLIs.
 *
 * Dynamic import of mirrorJobTerminal avoids a top-level cycle with
 * mirror-agent-job.ts (which imports workflowCommander).
 */
async function finalizeRunCleanup(args: {
  runId: string;
  ticketId: string;
  workspaceId: string;
}): Promise<void> {
  const jobs = await prisma.agentJob.findMany({
    where: {
      workflowStepRun: { runId: args.runId },
      status: "RUNNING",
    },
    select: {
      id: true,
      agentId: true,
      ticketId: true,
      workspaceId: true,
      userId: true,
      source: true,
      kind: true,
      prompt: true,
      output: true,
      status: true,
      exitCode: true,
      error: true,
      worktreePath: true,
      claudeSessionId: true,
      workflowStepRunId: true,
      outcome: true,
      outcomeReason: true,
      sourceJobId: true,
      continuationAttempt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const sessionIds = new Set<string>();
  for (const job of jobs) {
    if (job.claudeSessionId) sessionIds.add(job.claudeSessionId);
  }
  // Also gather sessionIds from already-terminal jobs on the run — the
  // desktop CLI for an earlier step's session may still be alive even though
  // its AgentJob row went terminal (warm-send chains reuse one CLI process
  // across steps). Without this, finalizing a run whose AgentJobs all ended
  // cleanly mid-step would publish an empty sessionIds[] and leak the CLI.
  const terminalSessions = await prisma.agentJob.findMany({
    where: {
      workflowStepRun: { runId: args.runId },
      status: { not: "RUNNING" },
      claudeSessionId: { not: null },
    },
    select: { claudeSessionId: true },
  });
  for (const row of terminalSessions) {
    if (row.claudeSessionId) sessionIds.add(row.claudeSessionId);
  }

  for (const job of jobs) {
    const cas = await prisma.agentJob.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: {
        status: "CANCELED",
        error: "workflow finalized (run succeeded — agent stopped)",
        finishedAt: new Date(),
      },
    });
    if (cas.count === 0) continue;
    const { mirrorJobTerminal } = await import("@/server/services/mirror-agent-job");
    await mirrorJobTerminal({
      job: { ...job, status: "CANCELED" },
      status: "CANCELED",
      finalOutput: job.output ?? "",
    }).catch((error: unknown) => {
      logger.error("workflowCommander.finalize.mirrorJobTerminal.failed", {
        jobId: job.id,
        runId: args.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  await publishWorkspaceEvent(args.workspaceId, {
    name: "ticket.workflow.completed",
    workspaceId: args.workspaceId,
    ticketId: args.ticketId,
    runId: args.runId,
    sessionIds: Array.from(sessionIds),
  });
}

export const workflowCommander = {
  async startRun(args: {
    ticketId: string;
    workspaceId: string;
    templateId: string | null;
    steps: WorkflowStepInput[];
  }): Promise<{ runId: string; stepRunIds: string[] }> {
    const now = new Date();
    const run = await prisma.workflowRun.create({
      data: {
        ticketId: args.ticketId,
        workspaceId: args.workspaceId,
        templateId: args.templateId,
        status: "RUNNING",
        startedAt: now,
        stepRuns: {
          create: args.steps.map((step, index) => ({
            position: index,
            name: step.name,
            prompt: step.prompt,
            status: "PENDING" as const,
          })),
        },
      },
      select: {
        id: true,
        stepRuns: { orderBy: { position: "asc" }, select: { id: true } },
      },
    });
    return { runId: run.id, stepRunIds: run.stepRuns.map((step) => step.id) };
  },

  async dispatchNextStep(args: {
    runId: string;
    byUserId: string | null;
  }): Promise<{ dispatched: boolean; stepRunId?: string; reason?: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.workflowRun.findUnique({
        where: { id: args.runId },
        select: {
          id: true,
          status: true,
          ticketId: true,
          workspaceId: true,
          stepRuns: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              runId: true,
              name: true,
              prompt: true,
              position: true,
              status: true,
              run: { select: { id: true, ticketId: true, workspaceId: true } },
            },
          },
        },
      });
      if (!run) return { kind: "noop" as const, reason: "run_not_found" };
      if (run.status !== "RUNNING") return { kind: "noop" as const, reason: "run_not_running" };
      if (run.stepRuns.some((step) => step.status === "FAILED" || step.status === "CANCELED")) {
        return { kind: "noop" as const, reason: "run_has_failed_step" };
      }
      if (run.stepRuns.some((step) => step.status === "RUNNING")) {
        return { kind: "noop" as const, reason: "step_already_running" };
      }

      const next = run.stepRuns.find((step) => step.status === "PENDING");
      if (!next) {
        const allDone = run.stepRuns.every((step) => step.status === "SUCCEEDED");
        if (allDone) {
          const finalize = await tx.workflowRun.updateMany({
            where: { id: run.id, status: "RUNNING" },
            data: { status: "SUCCEEDED", finishedAt: new Date() },
          });
          // Only the request that actually flipped RUNNING → SUCCEEDED owns
          // the post-finalize cleanup. Inngest retries / racing dispatchers
          // see count=0 and skip, so we don't re-reap or re-publish.
          return {
            kind: "finalized" as const,
            runId: run.id,
            ticketId: run.ticketId,
            workspaceId: run.workspaceId,
            transitioned: finalize.count === 1,
          };
        }
        return { kind: "noop" as const, reason: "no_pending_step" };
      }

      const liveJob = await tx.agentJob.findFirst({
        where: { workflowStepRunId: next.id, status: { in: ["PENDING", "RUNNING"] } },
        select: { id: true },
      });
      if (liveJob) return { kind: "noop" as const, reason: "step_already_has_live_job" };

      const update = await tx.workflowStepRun.updateMany({
        where: { id: next.id, status: "PENDING" },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      if (update.count !== 1) return { kind: "noop" as const, reason: "step_not_pending" };

      const payload: StepActivityPayload = {
        name: next.name,
        byUserId: args.byUserId,
      };
      const existing = await tx.ticketActivity.findFirst({
        where: { workflowStepRunId: next.id, kind: "STEP_STARTED" },
        select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
      });
      const activity =
        existing ??
        (await tx.ticketActivity.create({
          data: {
            ticketId: run.ticketId,
            workspaceId: run.workspaceId,
            workflowStepRunId: next.id,
            kind: "STEP_STARTED",
            payload: payload as Prisma.InputJsonValue,
          },
          select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
        }));

      return { kind: "dispatch" as const, stepRun: next, activity, total: run.stepRuns.length };
    });

    if (result.kind === "finalized") {
      if (result.transitioned) {
        await finalizeRunCleanup({
          runId: result.runId,
          ticketId: result.ticketId,
          workspaceId: result.workspaceId,
        });
      }
      return { dispatched: false, reason: "workflow_completed" };
    }
    if (result.kind !== "dispatch") {
      return { dispatched: false, reason: result.reason };
    }
    await publishActivity({
      workspaceId: result.stepRun.run.workspaceId,
      ticketId: result.stepRun.run.ticketId,
      activity: result.activity,
    });
    await publishWorkspaceEvent(result.stepRun.run.workspaceId, {
      name: "ticket.workflow.dispatch",
      workspaceId: result.stepRun.run.workspaceId,
      ticketId: result.stepRun.run.ticketId,
      runId: result.stepRun.run.id,
      stepRunId: result.stepRun.id,
      stepName: result.stepRun.name,
      position: result.stepRun.position,
      total: result.total,
      prompt: withWorkflowStepBoundary({
        stepName: result.stepRun.name,
        position: result.stepRun.position,
        total: result.total,
        prompt: result.stepRun.prompt,
      }),
    });
    return { dispatched: true, stepRunId: result.stepRun.id };
  },

  async attachJobToStep(args: {
    stepRunId: string;
    jobId: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const stepRun = await prisma.workflowStepRun.findUnique({
      where: { id: args.stepRunId },
      select: { id: true, status: true },
    });
    if (!stepRun) return { ok: false, reason: "step_not_found" };
    if (stepRun.status === "PENDING") {
      const update = await prisma.workflowStepRun.updateMany({
        where: { id: args.stepRunId, status: "PENDING" },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      if (update.count > 0) {
        const activity = await createStepActivity({
          workflowStepRunId: args.stepRunId,
          kind: "STEP_STARTED",
          payload: { byUserId: null },
        });
        if (activity) await publishActivity(activity);
      }
    }
    await prisma.agentJob.updateMany({
      where: { id: args.jobId, workflowStepRunId: null },
      data: { workflowStepRunId: args.stepRunId },
    });
    return { ok: true };
  },

  async completeStep(args: {
    stepRunId: string;
    jobId: string | null;
    result: "success" | "failure";
    error?: string;
  }): Promise<{ transitioned: boolean; runId: string | null }> {
    const status: WorkflowRunStatus = args.result === "success" ? "SUCCEEDED" : "FAILED";
    const stepRun = await prisma.workflowStepRun.findUnique({
      where: { id: args.stepRunId },
      select: {
        id: true,
        name: true,
        runId: true,
        status: true,
        run: { select: { ticketId: true, workspaceId: true } },
      },
    });
    if (!stepRun) return { transitioned: false, runId: null };

    const cas = await prisma.workflowStepRun.updateMany({
      where: { id: args.stepRunId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status, finishedAt: new Date() },
    });
    const activity = await createStepActivity({
      workflowStepRunId: args.stepRunId,
      kind: "STEP_COMPLETED",
      jobId: args.jobId,
      payload: {
        name: stepRun.name,
        byUserId: null,
        result: args.result,
        ...(args.error ? { error: args.error.slice(0, 480) } : {}),
      },
    });
    if (activity) await publishActivity(activity);
    return { transitioned: cas.count > 0, runId: stepRun.runId };
  },

  /**
   * Record the agent's structured step-finish decision (AUTO | BLOCK | SHIP).
   * Replaces the legacy `autonomous` ticket label as the auto-chain gate.
   *
   * The decision is the *intent* the agent is declaring; the actual step
   * status (PENDING → RUNNING → SUCCEEDED) is still driven by the turn-end
   * mirror as before. Both halves of the auto-chain gate (`persistTurnEnd`
   * in mirror-agent-job.ts and the `workflow/step.completed` Inngest
   * handler) read this column via `shouldAutoChainAfterStep` and must
   * agree — the column is the single source of truth so they always do.
   *
   * Idempotent: re-applying the same decision is a no-op; applying a
   * different one fails with `decision_conflict` to surface accidental
   * double-finish from warm-sends / retries.
   */
  async finishStep(args: {
    stepRunId: string;
    decision: StepDecision;
    byUserId: string | null;
  }): Promise<
    | {
        ok: true;
        alreadyFinished: boolean;
        stepRun: {
          id: string;
          runId: string;
          name: string;
          ticketId: string;
          workspaceId: string;
        };
      }
    | { ok: false; reason: "step_not_found" | "step_not_finishable" | "decision_conflict" }
  > {
    return prisma.$transaction(async (tx) => {
      const stepRun = await tx.workflowStepRun.findUnique({
        where: { id: args.stepRunId },
        select: {
          id: true,
          runId: true,
          name: true,
          status: true,
          decision: true,
          run: { select: { ticketId: true, workspaceId: true } },
        },
      });
      if (!stepRun) return { ok: false as const, reason: "step_not_found" as const };
      // The agent may emit finish either while the step is still RUNNING
      // (the common case — finish lands before the turn-end mirror flips
      // it to SUCCEEDED) or just after it already SUCCEEDED (a late
      // finish, e.g. a warm-send race). Both are acceptable; FAILED /
      // CANCELED steps aren't.
      if (!(["PENDING", "RUNNING", "SUCCEEDED"] as WorkflowRunStatus[]).includes(stepRun.status)) {
        return { ok: false as const, reason: "step_not_finishable" as const };
      }
      const shaped = {
        id: stepRun.id,
        runId: stepRun.runId,
        name: stepRun.name,
        ticketId: stepRun.run.ticketId,
        workspaceId: stepRun.run.workspaceId,
      };
      if (stepRun.decision && stepRun.decision !== args.decision) {
        return { ok: false as const, reason: "decision_conflict" as const };
      }
      if (stepRun.decision === args.decision) {
        return { ok: true as const, alreadyFinished: true, stepRun: shaped };
      }
      await tx.workflowStepRun.update({
        where: { id: args.stepRunId },
        data: { decision: args.decision },
      });
      return { ok: true as const, alreadyFinished: false, stepRun: shaped };
    });
  },

  async cancelRun(args: { runId: string; reason: string }): Promise<{ canceled: boolean }> {
    const finishedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.workflowStepRun.updateMany({
        where: { runId: args.runId, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: "CANCELED", finishedAt },
      });
      return tx.workflowRun.updateMany({
        where: { id: args.runId, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: "CANCELED", finishedAt, error: args.reason },
      });
    });
    return { canceled: result.count > 0 };
  },
};

export async function dispatchNextWorkflowStep(
  runId: string,
  byUserId: string | null,
): Promise<void> {
  const result = await workflowCommander.dispatchNextStep({ runId, byUserId });
  if (!result.dispatched && result.reason && result.reason !== "workflow_completed") {
    logger.info("workflow.dispatch.skipped", { runId, reason: result.reason });
  }
}

// Auto-chain gate: the server should only run the "demote ticket → Blocked AND
// fire `dispatchNextStep` in parallel" sequence when the workflow is meant to
// drain without human intervention. Both callers (persistTurnEnd's reconcile
// in mirror-agent-job.ts and the Inngest workflow-step-completed handler's
// dispatch) must agree, or the two halves race and the desktop bridge's
// Blocked-handler SIGTERMs the still-warm Claude session that just warm-sent
// the next step. See PLAN-LYVQV8 forensics for the exact race.
//
// Decision-first protocol (PLAN-5AXJCL): the agent declares intent by writing
// a `StepDecision` on `WorkflowStepRun.decision` via `pbq workflow finish`.
// `AUTO` → chain; `BLOCK` / `SHIP` → don't chain (BLOCK demotes to Blocked;
// SHIP routes through `pbq ship`). If `decision IS NULL` the agent never
// emitted one — fall back to the legacy `autonomous` ticket label so
// pre-protocol clients keep working for one release.
export async function shouldAutoChainAfterStep(args: {
  ticketId: string;
  runId: string;
  finishedStepRunId: string | null;
}): Promise<boolean> {
  const [stepRun, ticket, pendingCount] = await Promise.all([
    args.finishedStepRunId
      ? prisma.workflowStepRun.findUnique({
          where: { id: args.finishedStepRunId },
          select: { decision: true },
        })
      : Promise.resolve(null),
    prisma.ticket.findUnique({
      where: { id: args.ticketId },
      select: { labels: { select: { name: true } } },
    }),
    prisma.workflowStepRun.count({
      where: { runId: args.runId, status: "PENDING" },
    }),
  ]);
  if (!ticket || pendingCount === 0) return false;
  if (stepRun?.decision) {
    return stepRun.decision === "AUTO";
  }
  // Legacy fallback: the agent never emitted a structured decision. Honor
  // the autonomous label until the protocol fully rolls out.
  return ticket.labels.some((l) => l.name.trim().toLowerCase() === "autonomous");
}

export type { WorkflowStepRunSnapshot };

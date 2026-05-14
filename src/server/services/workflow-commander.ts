import "server-only";

import type { Prisma, TicketActivityKind, WorkflowRunStatus } from "@prisma/client";
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
  return [
    `You are executing exactly one Planbooq workflow step: "${args.stepName}" (${args.position + 1}/${args.total}).`,
    "",
    "Hard boundary rules:",
    "- Do only the work requested by this step's prompt.",
    "- Do not begin, preview, implement, commit, push, open a PR, ship, or otherwise perform any later workflow step unless this step's prompt explicitly asks for that exact action.",
    "- When this step is complete, say what you completed and then stop. Do not continue into the next step. Planbooq will dispatch the next workflow step in a separate prompt.",
    "- If the next step seems obvious, still stop and wait for Planbooq to dispatch it.",
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
          await tx.workflowRun.updateMany({
            where: { id: run.id, status: "RUNNING" },
            data: { status: "SUCCEEDED", finishedAt: new Date() },
          });
          return { kind: "noop" as const, reason: "workflow_completed" };
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
// drain without human intervention. The user opt-in is the `autonomous` ticket
// label; everything else stops between steps and waits for a manual Run click.
//
// Returns true iff the ticket carries the `autonomous` label AND the run has
// at least one PENDING step left. Both callers (persistTurnEnd's reconcile,
// the Inngest workflow-step-completed handler's dispatch) must agree, or the
// two halves race and the desktop bridge's Blocked-handler SIGTERMs the
// still-warm Claude session that just warm-sent the next step. See the
// PLAN-LYVQV8 forensics for the exact race.
export async function shouldAutoChainAfterStep(ticketId: string, runId: string): Promise<boolean> {
  const [ticket, pendingCount] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { labels: { select: { name: true } } },
    }),
    prisma.workflowStepRun.count({
      where: { runId, status: "PENDING" },
    }),
  ]);
  if (!ticket || pendingCount === 0) return false;
  return ticket.labels.some((l) => l.name.trim().toLowerCase() === "autonomous");
}

export type { WorkflowStepRunSnapshot };

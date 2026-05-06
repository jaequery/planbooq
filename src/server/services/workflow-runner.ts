import "server-only";

import { prisma } from "@/server/db";
import {
  createAgentJobForTicket,
  pickAgentForUser,
} from "@/server/services/agent-jobs";

/**
 * Dispatch the given step run as an AgentJob on the user's paired agent.
 * The job appears in the ticket's Agent Chat and writes Activity entries
 * the same way as any manual chat dispatch — workflow steps are first-class
 * agent jobs, not a side channel.
 */
async function dispatchStep(args: {
  ticketId: string;
  workspaceId: string;
  userId: string;
  stepRunId: string;
  position: number;
  totalSteps: number;
  name: string;
  prompt: string;
}): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const agent = await pickAgentForUser({
    workspaceId: args.workspaceId,
    userId: args.userId,
  });
  if (!agent) return { ok: false, error: "no_agent_paired" };

  const header = `[Workflow step ${args.position + 1}/${args.totalSteps}: ${args.name}]\n`;
  const job = await prisma.agentJob.create({
    data: {
      agentId: agent.id,
      ticketId: args.ticketId,
      prompt: `${header}${args.prompt}`,
      status: "PENDING",
      kind: "CHAT",
      workflowStepRunId: args.stepRunId,
    },
    select: { id: true },
  });

  const { publishAgentEvent } = await import("@/server/ably");
  await publishAgentEvent(agent.id, "job.dispatch", {
    jobId: job.id,
    ticketId: args.ticketId,
    prompt: `${header}${args.prompt}`,
  });

  await prisma.workflowStepRun.update({
    where: { id: args.stepRunId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  await prisma.ticketActivity.create({
    data: {
      ticketId: args.ticketId,
      workspaceId: args.workspaceId,
      jobId: job.id,
      kind: "NOTE",
      payload: {
        source: "workflow",
        kind: "step_started",
        stepRunId: args.stepRunId,
        position: args.position,
        name: args.name,
      },
    },
  });

  return { ok: true, jobId: job.id };
}

/**
 * Start a WorkflowRun: mark RUNNING and dispatch the first step.
 * Subsequent steps fire from advanceWorkflowAfterJob() when each AgentJob
 * reaches a terminal state (SUCCEEDED / FAILED / CANCELED).
 */
export async function startWorkflowRun(args: {
  runId: string;
  ticketId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: args.runId },
    select: {
      id: true,
      status: true,
      stepRuns: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, prompt: true, position: true },
      },
    },
  });
  if (!run) return { ok: false, error: "run_not_found" };
  if (run.stepRuns.length === 0) return { ok: false, error: "no_steps" };

  await prisma.workflowRun.update({
    where: { id: args.runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const first = run.stepRuns[0];
  if (!first) return { ok: false, error: "no_steps" };

  const dispatched = await dispatchStep({
    ticketId: args.ticketId,
    workspaceId: args.workspaceId,
    userId: args.userId,
    stepRunId: first.id,
    position: first.position,
    totalSteps: run.stepRuns.length,
    name: first.name,
    prompt: first.prompt,
  });

  if (!dispatched.ok) {
    await prisma.workflowRun.update({
      where: { id: args.runId },
      data: { status: "FAILED", finishedAt: new Date(), error: dispatched.error },
    });
    await prisma.workflowStepRun.update({
      where: { id: first.id },
      data: { status: "FAILED", finishedAt: new Date() },
    });
    await prisma.ticketActivity.create({
      data: {
        ticketId: args.ticketId,
        workspaceId: args.workspaceId,
        kind: "NOTE",
        payload: {
          source: "workflow",
          kind: "run_failed",
          runId: args.runId,
          error: dispatched.error,
        },
      },
    });
    return dispatched;
  }
  return { ok: true };
}

/**
 * Called from the agent jobs PATCH endpoint when a workflow-linked AgentJob
 * reaches a terminal state. Marks the corresponding StepRun, then either
 * dispatches the next step or finalizes the run.
 */
export async function advanceWorkflowAfterJob(args: {
  jobId: string;
  status: "SUCCEEDED" | "FAILED" | "CANCELED";
  output?: string;
}): Promise<void> {
  const job = await prisma.agentJob.findUnique({
    where: { id: args.jobId },
    select: {
      id: true,
      ticketId: true,
      output: true,
      workflowStepRunId: true,
      ticket: { select: { workspaceId: true, createdById: true } },
    },
  });
  if (!job?.workflowStepRunId) return;

  const stepRun = await prisma.workflowStepRun.findUnique({
    where: { id: job.workflowStepRunId },
    select: {
      id: true,
      runId: true,
      position: true,
      run: {
        select: {
          id: true,
          status: true,
          ticketId: true,
          workspaceId: true,
          stepRuns: {
            orderBy: { position: "asc" },
            select: { id: true, position: true, name: true, prompt: true, status: true },
          },
        },
      },
    },
  });
  if (!stepRun) return;

  await prisma.workflowStepRun.update({
    where: { id: stepRun.id },
    data: {
      status: args.status,
      output: args.output ?? job.output ?? "",
      finishedAt: new Date(),
    },
  });

  await prisma.ticketActivity.create({
    data: {
      ticketId: stepRun.run.ticketId,
      workspaceId: stepRun.run.workspaceId,
      jobId: job.id,
      kind: "NOTE",
      payload: {
        source: "workflow",
        kind: args.status === "SUCCEEDED" ? "step_succeeded" : "step_failed",
        stepRunId: stepRun.id,
        position: stepRun.position,
      },
    },
  });

  if (args.status !== "SUCCEEDED") {
    await prisma.workflowRun.update({
      where: { id: stepRun.run.id },
      data: { status: args.status, finishedAt: new Date() },
    });
    await prisma.ticketActivity.create({
      data: {
        ticketId: stepRun.run.ticketId,
        workspaceId: stepRun.run.workspaceId,
        kind: "NOTE",
        payload: {
          source: "workflow",
          kind: "run_failed",
          runId: stepRun.run.id,
          stoppedAt: stepRun.position,
        },
      },
    });
    return;
  }

  // Find next pending step.
  const next = stepRun.run.stepRuns.find(
    (s) => s.position > stepRun.position && s.status === "PENDING",
  );
  if (!next) {
    await prisma.workflowRun.update({
      where: { id: stepRun.run.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
    await prisma.ticketActivity.create({
      data: {
        ticketId: stepRun.run.ticketId,
        workspaceId: stepRun.run.workspaceId,
        kind: "NOTE",
        payload: {
          source: "workflow",
          kind: "run_succeeded",
          runId: stepRun.run.id,
        },
      },
    });
    return;
  }

  if (!job.ticket) return;
  const dispatched = await dispatchStep({
    ticketId: stepRun.run.ticketId,
    workspaceId: stepRun.run.workspaceId,
    userId: job.ticket.createdById,
    stepRunId: next.id,
    position: next.position,
    totalSteps: stepRun.run.stepRuns.length,
    name: next.name,
    prompt: next.prompt,
  });
  if (!dispatched.ok) {
    await prisma.workflowStepRun.update({
      where: { id: next.id },
      data: { status: "FAILED", finishedAt: new Date() },
    });
    await prisma.workflowRun.update({
      where: { id: stepRun.run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: dispatched.error },
    });
    await prisma.ticketActivity.create({
      data: {
        ticketId: stepRun.run.ticketId,
        workspaceId: stepRun.run.workspaceId,
        kind: "NOTE",
        payload: {
          source: "workflow",
          kind: "run_failed",
          runId: stepRun.run.id,
          error: dispatched.error,
        },
      },
    });
  }
}

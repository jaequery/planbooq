import assert from "node:assert/strict";
import Module from "node:module";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { decodeKeysetCursor, encodeKeysetCursor } from "../src/lib/keyset-cursor";
import { selectAuthoritativeLiveJobs } from "../src/lib/live-agent-jobs";
import { sortTicketsByPosition } from "../src/lib/ticket-ordering";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleWithLoad = Module as unknown as { _load: ModuleLoader };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function load(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const baseDate = new Date("2026-05-12T12:00:00.000Z");

const ordered = sortTicketsByPosition([
  { id: "b", position: 2, updatedAt: baseDate },
  { id: "a", position: 1, updatedAt: baseDate },
  { id: "c", position: 2, updatedAt: new Date("2026-05-12T12:01:00.000Z") },
]);
assert.deepEqual(
  ordered.map((ticket) => ticket.id),
  ["a", "c", "b"],
  "tickets sort by position, then newest updatedAt, then id",
);

const selectedJobs = selectAuthoritativeLiveJobs([
  {
    id: "newer-pending",
    ticketId: "ticket-1",
    status: "PENDING" as const,
    createdAt: new Date("2026-05-12T12:03:00.000Z"),
  },
  {
    id: "older-running",
    ticketId: "ticket-1",
    status: "RUNNING" as const,
    createdAt: new Date("2026-05-12T12:01:00.000Z"),
  },
  {
    id: "ticket-2-newer",
    ticketId: "ticket-2",
    status: "PENDING" as const,
    createdAt: new Date("2026-05-12T12:02:00.000Z"),
  },
  {
    id: "ticket-2-older",
    ticketId: "ticket-2",
    status: "PENDING" as const,
    createdAt: new Date("2026-05-12T12:00:00.000Z"),
  },
]);
assert.deepEqual(
  selectedJobs.map((job) => job.id).sort(),
  ["older-running", "ticket-2-newer"],
  "live job reconciliation prefers RUNNING, then newest per ticket",
);

const encoded = encodeKeysetCursor(baseDate, "row-1");
assert.deepEqual(decodeKeysetCursor(encoded), { createdAt: baseDate, id: "row-1" });
assert.equal(decodeKeysetCursor("legacy-id-only"), null);

async function assertWorkflowCommanderPersistsStepActivity(): Promise<void> {
  process.env.ABLY_API_KEY = "";
  const { workflowCommander, withWorkflowStepBoundary } = await import(
    "../src/server/services/workflow-commander"
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `workflow-regression-${suffix}@example.test`;
  const workspaceSlug = `wf-regression-${suffix}`.slice(0, 60);
  let workspaceId: string | null = null;

  try {
    const user = await prisma.user.create({ data: { email } });
    const workspace = await prisma.workspace.create({
      data: {
        slug: workspaceSlug,
        name: "Workflow regression",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        slug: `project-${suffix}`.slice(0, 60),
        name: "Workflow regression",
        color: "#0f172a",
        position: 1,
      },
    });
    const status = await prisma.status.create({
      data: {
        workspaceId: workspace.id,
        key: "backlog",
        name: "Backlog",
        color: "#64748b",
        position: 1,
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        statusId: status.id,
        title: "Workflow commander regression",
        position: 1,
        createdById: user.id,
      },
    });

    const run = await workflowCommander.startRun({
      ticketId: ticket.id,
      workspaceId: workspace.id,
      templateId: null,
      steps: [
        { name: "Plan", prompt: "[Workflow 1/2: Plan]\nPlan it." },
        { name: "Issue PR", prompt: "[Workflow 2/2: Issue PR]\nOpen the PR." },
      ],
    });
    assert.equal(run.stepRunIds.length, 2);
    const [firstStepRunId, secondStepRunId] = run.stepRunIds;
    assert.ok(firstStepRunId);
    assert.ok(secondStepRunId);

    const firstDispatch = await workflowCommander.dispatchNextStep({
      runId: run.runId,
      byUserId: user.id,
    });
    assert.equal(firstDispatch.dispatched, true);
    assert.equal(firstDispatch.stepRunId, firstStepRunId);
    const bounded = withWorkflowStepBoundary({
      stepName: "Plan",
      position: 0,
      total: 2,
      prompt: "[Workflow 1/2: Plan]\nPlan it.",
    });
    assert.match(bounded, /Do not begin.*later workflow step/s);
    assert.match(bounded, /stop and wait for Planbooq to dispatch it/);

    const firstStarted = await prisma.ticketActivity.findFirstOrThrow({
      where: { workflowStepRunId: firstStepRunId, kind: "STEP_STARTED" },
    });
    assert.equal((firstStarted.payload as { name?: string }).name, "Plan");

    const firstComplete = await workflowCommander.completeStep({
      stepRunId: firstStepRunId,
      jobId: null,
      result: "success",
    });
    assert.equal(firstComplete.transitioned, true);
    await workflowCommander.completeStep({
      stepRunId: firstStepRunId,
      jobId: null,
      result: "success",
    });
    const firstCompleteCount = await prisma.ticketActivity.count({
      where: { workflowStepRunId: firstStepRunId, kind: "STEP_COMPLETED" },
    });
    assert.equal(firstCompleteCount, 1, "step completion is idempotent by workflowStepRunId");

    const secondDispatch = await workflowCommander.dispatchNextStep({
      runId: run.runId,
      byUserId: user.id,
    });
    assert.equal(secondDispatch.dispatched, true);
    assert.equal(secondDispatch.stepRunId, secondStepRunId);
    const secondStarted = await prisma.ticketActivity.findFirstOrThrow({
      where: { workflowStepRunId: secondStepRunId, kind: "STEP_STARTED" },
    });
    assert.equal((secondStarted.payload as { name?: string }).name, "Issue PR");

    await workflowCommander.completeStep({
      stepRunId: secondStepRunId,
      jobId: null,
      result: "success",
    });
    await workflowCommander.dispatchNextStep({ runId: run.runId, byUserId: user.id });
    const closed = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.runId } });
    assert.equal(closed.status, "SUCCEEDED");
  } finally {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

// PLAN-N4THY7: warm-send-cancel mis-credit. A single AgentJob can span two
// workflow steps when the desktop client warm-sends the next step's prompt
// into the still-alive Claude session — that writes a USER row tagged to the
// next step's WorkflowStepRun. If the job is then CANCELED before the agent
// produces any output for that just-queued prompt, the OLD resolution logic
// returned `lastUser.workflowStepRunId` and `mirrorJobTerminal` flipped the
// next step PENDING → FAILED for work it never started. The fix only honors
// `lastUser.workflowStepRunId` when at least one non-USER message exists
// after it.
async function assertWarmSendCancelDoesNotMisCreditNextStep(): Promise<void> {
  process.env.ABLY_API_KEY = "";
  const { workflowCommander } = await import("../src/server/services/workflow-commander");
  const { mirrorJobTerminal } = await import("../src/server/services/mirror-agent-job");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `warm-send-cancel-${suffix}@example.test`;
  const workspaceSlug = `wsc-${suffix}`.slice(0, 60);
  let workspaceId: string | null = null;

  try {
    const user = await prisma.user.create({ data: { email } });
    const workspace = await prisma.workspace.create({
      data: {
        slug: workspaceSlug,
        name: "Warm-send cancel regression",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        slug: `project-${suffix}`.slice(0, 60),
        name: "Warm-send cancel regression",
        color: "#0f172a",
        position: 1,
      },
    });
    const status = await prisma.status.create({
      data: {
        workspaceId: workspace.id,
        key: "backlog",
        name: "Backlog",
        color: "#64748b",
        position: 1,
      },
    });

    // -- Helper: build a fresh ticket + run + Plan(SUCCEEDED) + Build(PENDING)
    //    + AgentJob bound to Plan + USER message tagged to Build (warm-send).
    const makeWarmSendScenario = async (
      label: string,
    ): Promise<{
      ticketId: string;
      jobId: string;
      planStepRunId: string;
      buildStepRunId: string;
    }> => {
      const ticket = await prisma.ticket.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          statusId: status.id,
          title: `Warm-send cancel: ${label}`,
          position: 1,
          createdById: user.id,
        },
      });
      const run = await workflowCommander.startRun({
        ticketId: ticket.id,
        workspaceId: workspace.id,
        templateId: null,
        steps: [
          { name: "Plan", prompt: "[Workflow 1/2: Plan]\nPlan it." },
          { name: "Build", prompt: "[Workflow 2/2: Build]\nBuild it." },
        ],
      });
      const [planStepRunId, buildStepRunId] = run.stepRunIds;
      assert.ok(planStepRunId);
      assert.ok(buildStepRunId);
      // Plan finished cleanly — this is the cold-start step the AgentJob is
      // bound to. completeStep's CAS will short-circuit any later attempt to
      // flip it FAILED.
      await workflowCommander.completeStep({
        stepRunId: planStepRunId,
        jobId: null,
        result: "success",
      });
      const job = await prisma.agentJob.create({
        data: {
          ticketId: ticket.id,
          workspaceId: workspace.id,
          userId: user.id,
          source: "PAIRED",
          kind: "CHAT",
          prompt: "[Workflow 1/2: Plan]\nPlan it.",
          status: "RUNNING",
          workflowStepRunId: planStepRunId,
        },
      });
      // Warm-send: a USER message tagged to Build's stepRunId lands on this
      // job. Zero agent output has been emitted for the new prompt yet.
      await prisma.message.create({
        data: {
          idempotencyKey: `agent-job:${job.id}:user:0`,
          conversationId: (
            await prisma.conversation.create({
              data: { ticketId: ticket.id, workspaceId: workspace.id },
            })
          ).id,
          workspaceId: workspace.id,
          role: "USER",
          authorUserId: user.id,
          agentJobId: job.id,
          workflowStepRunId: buildStepRunId,
          body: "[Workflow 2/2: Build]\nBuild it.",
          status: "COMPLETE",
        },
      });
      return { ticketId: ticket.id, jobId: job.id, planStepRunId, buildStepRunId };
    };

    // --- Case A: cancel mid-warm-send (zero non-USER messages after lastUser).
    //     Expectation: Build stays PENDING — the guard fires and falls back to
    //     `job.workflowStepRunId` (Plan, which is SUCCEEDED, so CAS no-ops).
    const a = await makeWarmSendScenario("no-agent-output");
    const aJob = await prisma.agentJob.findUniqueOrThrow({ where: { id: a.jobId } });
    await mirrorJobTerminal({
      job: aJob,
      status: "CANCELED",
      finalOutput: "",
      mode: "wire",
    });
    const aBuild = await prisma.workflowStepRun.findUniqueOrThrow({
      where: { id: a.buildStepRunId },
    });
    assert.equal(
      aBuild.status,
      "PENDING",
      "warm-send cancel with zero agent output must not flip the next step to FAILED",
    );
    const aPlan = await prisma.workflowStepRun.findUniqueOrThrow({
      where: { id: a.planStepRunId },
    });
    assert.equal(aPlan.status, "SUCCEEDED", "Plan stays SUCCEEDED — CAS guard short-circuits");

    // --- Case B: cancel AFTER Build started producing output. The guard
    //     should NOT fire — at least one non-USER message after lastUser. The
    //     cancel correctly credits Build, flipping it PENDING → FAILED.
    const b = await makeWarmSendScenario("with-agent-output");
    // Look up the warm-send USER row so we can place the agent message
    // strictly after it on the timeline.
    const bUser = await prisma.message.findFirstOrThrow({
      where: { agentJobId: b.jobId, role: "USER" },
      select: { id: true, conversationId: true, createdAt: true },
    });
    await prisma.message.create({
      data: {
        idempotencyKey: `agent-job:${b.jobId}:tool:0`,
        conversationId: bUser.conversationId,
        workspaceId: workspace.id,
        role: "SYSTEM",
        agentJobId: b.jobId,
        workflowStepRunId: b.buildStepRunId,
        body: "→ Read: src/foo.ts",
        status: "COMPLETE",
        // Stamp createdAt strictly after the warm-send USER row so the guard
        // sees a follow-up — same-millisecond writes would defeat the gt
        // filter.
        createdAt: new Date(bUser.createdAt.getTime() + 50),
      },
    });
    const bJob = await prisma.agentJob.findUniqueOrThrow({ where: { id: b.jobId } });
    await mirrorJobTerminal({
      job: bJob,
      status: "CANCELED",
      finalOutput: "",
      mode: "wire",
    });
    const bBuild = await prisma.workflowStepRun.findUniqueOrThrow({
      where: { id: b.buildStepRunId },
    });
    assert.equal(
      bBuild.status,
      "FAILED",
      "cancel after agent output should still credit Build (guard must not over-fire)",
    );
  } finally {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

// PLAN-QYP3IU: ship-decision stuck-at-RUNNING. When the agent emits `pbq
// workflow finish '{"next":"ship"}'` (or "block") the WorkflowStepRun gets
// `decision` written, but the actual RUNNING → SUCCEEDED transition still
// depends on the Claude wire stream emitting a `result` event so that
// persistTurnEnd can fire. If the agent stops mid-output, the bridge drops
// the final frame, or the CLI is warm-stopped between turns, the step is
// left RUNNING forever even though the job goes terminal SUCCEEDED — the
// ticket stays at Running and the workflow doesn't progress. The fix in
// mirrorJobTerminal force-closes the step on terminal SUCCEEDED when the
// step is still RUNNING AND has `decision` set (the agent's explicit
// "this step is done" signal). The guard avoids over-firing into warm-send:
// the freshly-warm-sent next step has no decision yet.
async function assertTerminalSucceededClosesStuckShipStep(): Promise<void> {
  process.env.ABLY_API_KEY = "";
  const { workflowCommander } = await import("../src/server/services/workflow-commander");
  const { mirrorJobTerminal } = await import("../src/server/services/mirror-agent-job");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `ship-stuck-${suffix}@example.test`;
  const workspaceSlug = `ship-stuck-${suffix}`.slice(0, 60);
  let workspaceId: string | null = null;

  try {
    const user = await prisma.user.create({ data: { email } });
    const workspace = await prisma.workspace.create({
      data: {
        slug: workspaceSlug,
        name: "Ship stuck regression",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        slug: `project-${suffix}`.slice(0, 60),
        name: "Ship stuck regression",
        color: "#0f172a",
        position: 1,
      },
    });
    const status = await prisma.status.create({
      data: {
        workspaceId: workspace.id,
        key: "backlog",
        name: "Backlog",
        color: "#64748b",
        position: 1,
      },
    });

    const makeScenario = async (
      label: string,
      decision: "SHIP" | "BLOCK" | "AUTO" | null,
    ): Promise<{ ticketId: string; jobId: string; stepRunId: string; runId: string }> => {
      const ticket = await prisma.ticket.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          statusId: status.id,
          title: `Ship stuck: ${label}`,
          position: 1,
          createdById: user.id,
        },
      });
      const run = await workflowCommander.startRun({
        ticketId: ticket.id,
        workspaceId: workspace.id,
        templateId: null,
        steps: [{ name: "Build", prompt: "[Workflow 1/1: Build]\nBuild it." }],
      });
      const [stepRunId] = run.stepRunIds;
      assert.ok(stepRunId);
      // Promote to RUNNING — what dispatchNextStep would do after the user
      // clicked Run. We do it directly to keep the scenario focused on the
      // terminal-SUCCEEDED-without-result path.
      await prisma.workflowStepRun.update({
        where: { id: stepRunId },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      if (decision) {
        await prisma.workflowStepRun.update({
          where: { id: stepRunId },
          data: { decision },
        });
      }
      const job = await prisma.agentJob.create({
        data: {
          ticketId: ticket.id,
          workspaceId: workspace.id,
          userId: user.id,
          source: "PAIRED",
          kind: "CHAT",
          prompt: "[Workflow 1/1: Build]\nBuild it.",
          status: "SUCCEEDED",
          finishedAt: new Date(),
          workflowStepRunId: stepRunId,
        },
      });
      return { ticketId: ticket.id, jobId: job.id, stepRunId, runId: run.runId };
    };

    // --- Case A: decision=SHIP, step still RUNNING, job terminal SUCCEEDED
    //     without ever firing `result`. The backstop should close the step.
    const a = await makeScenario("ship-no-result", "SHIP");
    const aJob = await prisma.agentJob.findUniqueOrThrow({ where: { id: a.jobId } });
    await mirrorJobTerminal({ job: aJob, status: "SUCCEEDED", finalOutput: "", mode: "wire" });
    const aStep = await prisma.workflowStepRun.findUniqueOrThrow({ where: { id: a.stepRunId } });
    assert.equal(
      aStep.status,
      "SUCCEEDED",
      "terminal SUCCEEDED with decision=SHIP must force-close the still-RUNNING step",
    );
    const aActivity = await prisma.ticketActivity.count({
      where: { workflowStepRunId: a.stepRunId, kind: "STEP_COMPLETED" },
    });
    assert.equal(aActivity, 1, "STEP_COMPLETED activity logged exactly once");

    // --- Case B: decision=BLOCK behaves the same — the gate is "decision is
    //     set", not "decision is SHIP". Both halt the auto-chain identically.
    const b = await makeScenario("block-no-result", "BLOCK");
    const bJob = await prisma.agentJob.findUniqueOrThrow({ where: { id: b.jobId } });
    await mirrorJobTerminal({ job: bJob, status: "SUCCEEDED", finalOutput: "", mode: "wire" });
    const bStep = await prisma.workflowStepRun.findUniqueOrThrow({ where: { id: b.stepRunId } });
    assert.equal(
      bStep.status,
      "SUCCEEDED",
      "BLOCK decision also force-closes on terminal SUCCEEDED",
    );

    // --- Case C: decision IS NULL. This is the warm-send / "agent didn't
    //     declare intent" path — we MUST NOT close the step here, because the
    //     job might still legitimately span more turns via warm-send. The
    //     guard's whole job is to keep this case PENDING/RUNNING.
    const c = await makeScenario("no-decision", null);
    const cJob = await prisma.agentJob.findUniqueOrThrow({ where: { id: c.jobId } });
    await mirrorJobTerminal({ job: cJob, status: "SUCCEEDED", finalOutput: "", mode: "wire" });
    const cStep = await prisma.workflowStepRun.findUniqueOrThrow({ where: { id: c.stepRunId } });
    assert.equal(
      cStep.status,
      "RUNNING",
      "terminal SUCCEEDED without decision must NOT force-close (warm-send safety)",
    );

    // --- Case D: idempotency. Re-applying the terminal after a step already
    //     SUCCEEDED is a no-op — completeStep's CAS short-circuits.
    const d = await makeScenario("idempotent", "SHIP");
    const dJob = await prisma.agentJob.findUniqueOrThrow({ where: { id: d.jobId } });
    await mirrorJobTerminal({ job: dJob, status: "SUCCEEDED", finalOutput: "", mode: "wire" });
    await mirrorJobTerminal({ job: dJob, status: "SUCCEEDED", finalOutput: "", mode: "wire" });
    const dStep = await prisma.workflowStepRun.findUniqueOrThrow({ where: { id: d.stepRunId } });
    assert.equal(dStep.status, "SUCCEEDED", "double terminal SUCCEEDED stays SUCCEEDED");
    const dActivity = await prisma.ticketActivity.count({
      where: { workflowStepRunId: d.stepRunId, kind: "STEP_COMPLETED" },
    });
    assert.equal(dActivity, 1, "STEP_COMPLETED activity stays singular under double-fire");
  } finally {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  await assertWorkflowCommanderPersistsStepActivity();
  await assertWarmSendCancelDoesNotMisCreditNextStep();
  await assertTerminalSucceededClosesStuckShipStep();
  console.log("workflow/chat/activity regression checks passed");
}

void main();

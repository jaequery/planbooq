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

async function main(): Promise<void> {
  await assertWorkflowCommanderPersistsStepActivity();
  console.log("workflow/chat/activity regression checks passed");
}

void main();

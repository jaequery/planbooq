import type { AgentJob } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { publishWorkspaceEvent } from "@/server/ably";
import { resolveCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";
import { maybeLinkPrUrlFromText } from "@/server/services/link-pr-url";
import { mirrorAppendOutput, mirrorJobTerminal } from "@/server/services/mirror-agent-job";
import { reconcileBuildingTicket } from "@/server/services/ticket-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    appendOutput: z.string().optional(),
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]).optional(),
    exitCode: z.number().int().optional(),
    error: z.string().optional(),
    worktreePath: z.string().optional().nullable(),
    claudeSessionId: z.string().optional().nullable(),
    // Bridge heartbeat — the renderer pushes this every 30s while a session
    // is alive, so `updatedAt` reflects bridge-confirmed liveness rather than
    // just "the wire stream produced an event recently." Mutually exclusive
    // with the other fields: a heartbeat PATCH bumps `updatedAt` and exits;
    // no mirror, no reconcile, no Ably publish. See agent-session-manager.ts.
    heartbeat: z.literal(true).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // resolveCaller accepts both NextAuth session cookies (renderer/browser
  // path) AND Bearer `pbq_live_…` api keys (Electron main heartbeat path).
  // Electron main doesn't share cookies with the renderer, so it
  // authenticates via the same workspace-scoped token it already uses for
  // the in-worktree `pbq` CLI. The job-ownership check below is unchanged —
  // both auth paths must resolve to the user who owns the AgentJob.
  const caller = await resolveCaller(req);
  if (!caller) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = caller.userId;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  // Skip the multi-MB `output` and `prompt` TEXT columns on the hot streaming
  // path. Reading them on every chunk PATCH was the source of quadratic IO —
  // each append re-read the entire (growing) output blob. Mirror functions
  // don't read `output` either; on terminal we re-fetch it once for the
  // mirrorJobTerminal finalOutput parameter.
  const jobRow = await prisma.agentJob.findUnique({
    where: { id },
    select: {
      id: true,
      agentId: true,
      ticketId: true,
      workspaceId: true,
      userId: true,
      source: true,
      kind: true,
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
  if (!jobRow || jobRow.source !== "DESKTOP" || jobRow.userId !== userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  // Reconstruct an AgentJob-shaped object for mirror callees. They never read
  // the omitted columns; the empty strings just satisfy the TS contract.
  const job: AgentJob = { ...jobRow, output: "", prompt: "" };

  // Heartbeat fast-path. The renderer fires these every 30s while a session
  // is alive. Bumping `updatedAt` is the only side-effect — no mirror, no
  // ticket reconcile, no Ably fanout. Raw SQL because Prisma's `update`
  // optimizes empty `data: {}` to a no-op; we explicitly want the
  // `@updatedAt`-equivalent bump to happen.
  if (parsed.data.heartbeat && parsed.data.status === undefined) {
    // Ignore heartbeats for jobs that are already terminal — a stale renderer
    // (post-reload, pre-unregister) could keep pinging a FAILED row otherwise.
    if (job.status === "RUNNING") {
      await prisma.$executeRaw`UPDATE "AgentJob" SET "updatedAt" = NOW() WHERE id = ${id}`;
    }
    return NextResponse.json({ ok: true });
  }

  // Append-only path: single roundtrip, server-side concat. No read of the
  // existing blob — fixes the read-modify-write quadratic IO that pinned
  // PATCH latency to ~1s mid-session.
  if (parsed.data.appendOutput) {
    await prisma.$executeRaw`
      UPDATE "AgentJob"
         SET "output" = "output" || ${parsed.data.appendOutput},
             "updatedAt" = NOW()
       WHERE id = ${id}
    `;
  }

  // Status-mutation path (terminal events, worktree/session-id stamps). Runs
  // as a separate query so the hot append path stays single-roundtrip.
  const statusData: Record<string, unknown> = {};
  if (parsed.data.status) {
    statusData.status = parsed.data.status;
    if (
      parsed.data.status === "SUCCEEDED" ||
      parsed.data.status === "FAILED" ||
      parsed.data.status === "CANCELED"
    ) {
      statusData.finishedAt = new Date();
    }
  }
  if (typeof parsed.data.exitCode === "number") statusData.exitCode = parsed.data.exitCode;
  if (parsed.data.error) statusData.error = parsed.data.error;
  if (parsed.data.worktreePath !== undefined) statusData.worktreePath = parsed.data.worktreePath;
  if (parsed.data.claudeSessionId !== undefined) {
    statusData.claudeSessionId = parsed.data.claudeSessionId;
  }
  if (Object.keys(statusData).length > 0) {
    await prisma.agentJob.update({ where: { id }, data: statusData, select: { id: true } });
  }

  // Mirror this update into the new Conversation/Message surface so the
  // chat-style thread populates alongside the legacy AgentJob.output blob.
  // Failures here never affect the AgentJob update — mirror is best-effort.
  if (parsed.data.appendOutput) {
    void mirrorAppendOutput({ job, appendOutput: parsed.data.appendOutput });
  }
  if (
    parsed.data.status === "SUCCEEDED" ||
    parsed.data.status === "FAILED" ||
    parsed.data.status === "CANCELED"
  ) {
    // Read the now-final blob once on terminal. We skipped it on the hot path
    // above so this is the only place the full output gets pulled across.
    void prisma.agentJob
      .findUnique({ where: { id }, select: { output: true } })
      .then((row) => {
        void mirrorJobTerminal({
          job,
          status: parsed.data.status as "SUCCEEDED" | "FAILED" | "CANCELED",
          finalOutput: row?.output ?? "",
        });
      })
      .catch(() => undefined);
  }

  // Desktop chat output is free-form — the agent will frequently announce a
  // newly-created PR in the chat stream (e.g. "Opened https://github.com/.../pull/42")
  // without the post-tool-use hook ever firing on this path. Cheap substring
  // check first so we don't run regex + DB lookup on every wire chunk; PRs
  // are mentioned exactly once per session.
  if (
    parsed.data.appendOutput &&
    job.ticketId &&
    parsed.data.appendOutput.includes("github.com/")
  ) {
    void maybeLinkPrUrlFromText(job.ticketId, parsed.data.appendOutput).catch(() => undefined);
  }

  // Fanout for cross-tab/cross-client liveness.
  // Ably caps a single publish at 64KB; chunk large appendOutput so we stay under it.
  if (job.workspaceId && (parsed.data.appendOutput || parsed.data.status)) {
    const workspaceId = job.workspaceId;
    const kind = (job.kind as "PLAN" | "EXECUTE" | "CHAT") ?? "CHAT";
    const baseEvent = {
      name: "agent.delta" as const,
      jobId: id,
      ticketId: job.ticketId,
      workspaceId,
      kind,
    };
    const append = parsed.data.appendOutput;
    if (append && append.length > 0) {
      const CHUNK = 48 * 1024; // bytes-ish; leave headroom for JSON overhead
      const chunks: string[] = [];
      for (let i = 0; i < append.length; i += CHUNK) {
        chunks.push(append.slice(i, i + CHUNK));
      }
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        void publishWorkspaceEvent(workspaceId, {
          ...baseEvent,
          appendOutput: chunks[i],
          status: isLast ? parsed.data.status : undefined,
        });
      }
    } else {
      void publishWorkspaceEvent(workspaceId, {
        ...baseEvent,
        appendOutput: undefined,
        status: parsed.data.status,
      });
    }
  }

  // Server-authoritative ticket-status reconciliation. The renderer-side
  // `decideEndOfRun` only fires while the ticket dialog is mounted, so a
  // user who closed the dialog mid-run would otherwise leave the card
  // stranded in `building` forever. When the job hits a terminal status,
  // demote the ticket here too.
  const isTerminal =
    parsed.data.status === "SUCCEEDED" ||
    parsed.data.status === "FAILED" ||
    parsed.data.status === "CANCELED";
  if (isTerminal && job.ticketId) {
    void reconcileBuildingTicket({
      ticketId: job.ticketId,
      byUserId: job.userId ?? userId,
      excludeJobId: job.id,
      jobStatus: parsed.data.status as "SUCCEEDED" | "FAILED" | "CANCELED",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}

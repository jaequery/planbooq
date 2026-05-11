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

  const job = await prisma.agentJob.findUnique({ where: { id } });
  if (!job || job.source !== "DESKTOP" || job.userId !== userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

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

  const data: Record<string, unknown> = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (
      parsed.data.status === "SUCCEEDED" ||
      parsed.data.status === "FAILED" ||
      parsed.data.status === "CANCELED"
    ) {
      data.finishedAt = new Date();
    }
  }
  if (typeof parsed.data.exitCode === "number") data.exitCode = parsed.data.exitCode;
  if (parsed.data.error) data.error = parsed.data.error;
  if (parsed.data.appendOutput) {
    data.output = `${job.output}${parsed.data.appendOutput}`;
  }
  if (parsed.data.worktreePath !== undefined) data.worktreePath = parsed.data.worktreePath;
  if (parsed.data.claudeSessionId !== undefined) {
    data.claudeSessionId = parsed.data.claudeSessionId;
  }

  await prisma.agentJob.update({ where: { id }, data, select: { id: true } });

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
    const finalOutput = parsed.data.appendOutput
      ? `${job.output}${parsed.data.appendOutput}`
      : job.output;
    void mirrorJobTerminal({ job, status: parsed.data.status, finalOutput });
  }

  // Desktop chat output is free-form — the agent will frequently announce a
  // newly-created PR in the chat stream (e.g. "Opened https://github.com/.../pull/42")
  // without the post-tool-use hook ever firing on this path. Scan every
  // append for a PR URL and link the ticket if it isn't already linked.
  if (parsed.data.appendOutput && job.ticketId) {
    void maybeLinkPrUrlFromText(job.ticketId, parsed.data.appendOutput).catch(
      () => undefined,
    );
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

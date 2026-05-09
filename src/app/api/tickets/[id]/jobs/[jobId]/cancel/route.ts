import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { publishAgentEvent, publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { reconcileBuildingTicket } from "@/server/services/ticket-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tickets/:id/jobs/:jobId/cancel
 *
 * User-initiated cancellation. Marks the job CANCELED, fans out an
 * `agent.delta` so every open client drops its busy spinner, and — for
 * paired-agent jobs — publishes a `job.cancel` on the agent channel so
 * the remote agent can SIGTERM its `claude` child. PLAN streams continue
 * to write into the (now-CANCELED) row until the upstream fetch ends; the
 * client aborts its own read so the user sees an immediate stop.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; jobId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: ticketId, jobId } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: ticket.workspaceId, userId } },
  });
  if (!member) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const job = await prisma.agentJob.findUnique({ where: { id: jobId } });
  if (!job || job.ticketId !== ticketId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (job.status !== "PENDING" && job.status !== "RUNNING") {
    return NextResponse.json({ ok: true, data: { status: job.status, alreadyTerminal: true } });
  }

  const updated = await prisma.agentJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELED",
      finishedAt: new Date(),
      error: job.error ?? "canceled_by_user",
    },
    select: { id: true, kind: true, agentId: true, workspaceId: true },
  });

  const workspaceId = updated.workspaceId ?? ticket.workspaceId;
  void publishWorkspaceEvent(workspaceId, {
    name: "agent.delta",
    workspaceId,
    ticketId,
    jobId,
    kind: (updated.kind as "PLAN" | "EXECUTE" | "CHAT") ?? "CHAT",
    status: "CANCELED",
  });

  if (updated.agentId) {
    void publishAgentEvent(updated.agentId, "job.cancel", { jobId, ticketId }).catch((err) => {
      logger.warn("job.cancel.publish.failed", {
        jobId,
        agentId: updated.agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  void reconcileBuildingTicket({
    ticketId,
    byUserId: userId,
    excludeJobId: jobId,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, data: { status: "CANCELED" } });
}

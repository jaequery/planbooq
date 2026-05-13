import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { cancelAgentJob } from "@/server/services/agent-jobs";

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
 *
 * Cancellation side-effects live in `cancelAgentJob` (services/agent-jobs)
 * so `deleteTicketSvc` can reuse the same path when a ticket is deleted
 * mid-execution.
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

  const job = await prisma.agentJob.findUnique({
    where: { id: jobId },
    select: { id: true, ticketId: true },
  });
  if (!job || job.ticketId !== ticketId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const result = await cancelAgentJob({
    jobId,
    reason: "canceled_by_user",
    byUserId: userId,
  });

  if (result.status === "NOT_FOUND") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (result.status === "ALREADY_TERMINAL") {
    return NextResponse.json({
      ok: true,
      data: { status: result.jobStatus, alreadyTerminal: true },
    });
  }
  return NextResponse.json({ ok: true, data: { status: "CANCELED" } });
}

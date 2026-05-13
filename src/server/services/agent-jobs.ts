import "server-only";

import { logger } from "@/lib/logger";
import { publishAgentEvent, publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { reconcileBuildingTicket } from "@/server/services/ticket-status";

/**
 * Pick an online-ish agent for a workspace+user. Strategy:
 *   - non-revoked, scoped to the workspace and owner
 *   - prefer the most recently seen
 */
export async function pickAgentForUser(args: {
  workspaceId: string;
  userId: string;
}): Promise<{ id: string } | null> {
  const agent = await prisma.agent.findFirst({
    where: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      revokedAt: null,
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  return agent;
}

/**
 * Create an AgentJob and publish a job.dispatch over the agent channel.
 * Shared by manual dispatch and the status-aware Execute action.
 */
export async function createAgentJobForTicket(args: {
  agentId: string;
  ticketId: string;
  prompt: string;
}): Promise<{ jobId: string }> {
  const job = await prisma.agentJob.create({
    data: {
      agentId: args.agentId,
      ticketId: args.ticketId,
      prompt: args.prompt,
      status: "PENDING",
    },
    select: { id: true },
  });

  await publishAgentEvent(args.agentId, "job.dispatch", {
    jobId: job.id,
    ticketId: args.ticketId,
    prompt: args.prompt,
  });

  return { jobId: job.id };
}

export type CancelAgentJobResult =
  | { status: "CANCELED"; ticketId: string; workspaceId: string | null }
  | { status: "ALREADY_TERMINAL"; ticketId: string; jobStatus: string }
  | { status: "NOT_FOUND" };

/**
 * Cancel a PENDING or RUNNING AgentJob: marks it CANCELED, broadcasts an
 * `agent.delta` so clients drop their busy spinners, signals the desktop
 * agent via `job.cancel` so it can SIGTERM the `claude` child, and (by
 * default) reconciles the ticket's status away from "Building".
 *
 * Shared by user-initiated cancellation (the `/api/tickets/:id/jobs/:jobId/cancel`
 * route) and by `deleteTicketSvc`, which calls this for every in-flight
 * job on a ticket about to be deleted. When the caller is deleting the
 * ticket, pass `reconcileTicket: false` — the ticket is going away anyway
 * and we don't want to bounce its status mid-delete.
 */
export async function cancelAgentJob(args: {
  jobId: string;
  reason: string;
  byUserId?: string | null;
  reconcileTicket?: boolean;
}): Promise<CancelAgentJobResult> {
  const job = await prisma.agentJob.findUnique({ where: { id: args.jobId } });
  if (!job) return { status: "NOT_FOUND" };
  if (job.status !== "PENDING" && job.status !== "RUNNING") {
    return { status: "ALREADY_TERMINAL", ticketId: job.ticketId, jobStatus: job.status };
  }

  const updated = await prisma.agentJob.update({
    where: { id: args.jobId },
    data: {
      status: "CANCELED",
      finishedAt: new Date(),
      error: job.error ?? args.reason,
    },
    select: { id: true, kind: true, agentId: true, workspaceId: true, ticketId: true },
  });

  const workspaceId = updated.workspaceId;
  if (workspaceId) {
    void publishWorkspaceEvent(workspaceId, {
      name: "agent.delta",
      workspaceId,
      ticketId: updated.ticketId,
      jobId: updated.id,
      kind: (updated.kind as "PLAN" | "EXECUTE" | "CHAT") ?? "CHAT",
      status: "CANCELED",
    });
  }

  if (updated.agentId) {
    void publishAgentEvent(updated.agentId, "job.cancel", {
      jobId: updated.id,
      ticketId: updated.ticketId,
    }).catch((err) => {
      logger.warn("job.cancel.publish.failed", {
        jobId: updated.id,
        agentId: updated.agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  if (args.reconcileTicket !== false) {
    void reconcileBuildingTicket({
      ticketId: updated.ticketId,
      byUserId: args.byUserId ?? null,
      excludeJobId: updated.id,
      jobStatus: "CANCELED",
    }).catch(() => undefined);
  }

  return { status: "CANCELED", ticketId: updated.ticketId, workspaceId };
}

import "server-only";

import { publishAgentEvent } from "@/server/ably";
import { prisma } from "@/server/db";

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

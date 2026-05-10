import "server-only";

import { logger } from "@/lib/logger";
import { publishAgentEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { createAgentJobForTicket } from "@/server/services/agent-jobs";
import { checkAndConsume, mentionDispatchKey } from "@/server/services/rate-limit";

export type MentionDispatchOutcome =
  | { agentId: string; status: "dispatched"; jobId: string }
  | { agentId: string; status: "rate_limited" }
  | { agentId: string; status: "workspace_mismatch" }
  | { agentId: string; status: "agent_not_found" }
  | { agentId: string; status: "agent_revoked" }
  | { agentId: string; status: "dispatch_failed"; reason: string };

export async function dispatchAgentMentions(args: {
  message: { id: string; body: string; workspaceId: string };
  actorUserId: string;
  ticket: { id: string; workspaceId: string };
  mentions: { targetType: "USER" | "AGENT" | "TICKET"; targetId: string }[];
}): Promise<MentionDispatchOutcome[]> {
  const agentMentions = args.mentions.filter((m) => m.targetType === "AGENT");
  if (agentMentions.length === 0) return [];

  const outcomes: MentionDispatchOutcome[] = [];

  for (const mention of agentMentions) {
    const agentId = mention.targetId;

    // Cross-tenant guard: the mentioned agent must live in the ticket's
    // workspace. Without this check, a workspace-A user who knows a
    // workspace-B agent ID could trigger compute against B's pba_live_ token
    // and exfiltrate B's ticket context via the agent's reply.
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true, revokedAt: true },
    });
    if (!agent) {
      outcomes.push({ agentId, status: "agent_not_found" });
      continue;
    }
    if (agent.workspaceId !== args.ticket.workspaceId) {
      outcomes.push({ agentId, status: "workspace_mismatch" });
      continue;
    }
    if (agent.revokedAt) {
      outcomes.push({ agentId, status: "agent_revoked" });
      continue;
    }

    // Per-(workspace, user) rate limit on dispatch — blunts denial-of-wallet
    // via @agent spam. Per-user, not per-mention, so a single message that
    // mentions five agents counts as five tokens.
    if (!checkAndConsume(mentionDispatchKey(args.ticket.workspaceId, args.actorUserId))) {
      outcomes.push({ agentId, status: "rate_limited" });
      continue;
    }

    try {
      const { jobId } = await createAgentJobForTicket({
        agentId: agent.id,
        ticketId: args.ticket.id,
        prompt: args.message.body,
      });
      // The runtime will POST its reply to /api/agents/messages with this job
      // id; createAgentJobForTicket already publishes job.dispatch over the
      // agent's Ably channel, so the runtime picks it up.
      outcomes.push({ agentId, status: "dispatched", jobId });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      logger.error("mention-dispatch.failed", { agentId, ticketId: args.ticket.id, reason });
      outcomes.push({ agentId, status: "dispatch_failed", reason });
    }
  }

  // Surface non-dispatched outcomes back into the conversation as a SYSTEM
  // message so the user sees why their @mention didn't fire. We post one
  // summary line, not one per failure, to avoid timeline spam.
  const failures = outcomes.filter((o) => o.status !== "dispatched");
  if (failures.length > 0) {
    void publishAgentEvent("system", "mention.dispatch.failures", {
      messageId: args.message.id,
      ticketId: args.ticket.id,
      outcomes: failures,
    }).catch(() => undefined);
  }

  return outcomes;
}

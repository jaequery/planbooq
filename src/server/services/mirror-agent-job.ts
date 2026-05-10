import "server-only";

import type { AgentJob } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { getOrCreateConversationForTicket } from "@/server/services/conversations";
import { appendMessageChunkSvc, finalizeMessageSvc } from "@/server/services/messages";

// Lazy-create a paired Message for an AgentJob the first time we mirror its
// output. agentJobId is unique on Message, so the upsert is race-safe. Jobs
// without an agentId (server-orchestrated tasks, e.g. the Plan route) get a
// SYSTEM-role message — the CHECK constraint allows that without an author.
async function ensurePairedMessage(job: AgentJob): Promise<{
  messageId: string;
  agentId: string | null;
} | null> {
  if (!job.workspaceId || !job.ticketId) return null;
  const conversation = await getOrCreateConversationForTicket(job.ticketId);

  // Check if message already exists. We don't use upsert because a SYSTEM
  // create requires no author and an AGENT create requires authorAgentId —
  // the create payload differs by branch and prisma upsert wants a single
  // create object.
  const existing = await prisma.message.findUnique({
    where: { agentJobId: job.id },
    select: { id: true, authorAgentId: true },
  });
  if (existing) return { messageId: existing.id, agentId: existing.authorAgentId };

  const role = job.agentId ? "AGENT" : "SYSTEM";
  const message = await prisma.message.create({
    data: {
      idempotencyKey: `agent-job:${job.id}`,
      conversationId: conversation.id,
      workspaceId: job.workspaceId,
      role,
      authorAgentId: role === "AGENT" ? job.agentId : null,
      agentJobId: job.id,
      body: "",
      status: "PENDING",
    },
  });
  return { messageId: message.id, agentId: job.agentId };
}

// Track the next chunk sequence per message in-memory. Append-only; the DB
// has unique(messageId, sequence) so collisions on retry are no-ops.
const sequenceCursors = new Map<string, number>();

async function nextSequence(messageId: string): Promise<number> {
  const cached = sequenceCursors.get(messageId);
  if (cached !== undefined) {
    const next = cached + 1;
    sequenceCursors.set(messageId, next);
    return next;
  }
  const last = await prisma.messageChunk.findFirst({
    where: { messageId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const next = (last?.sequence ?? -1) + 1;
  sequenceCursors.set(messageId, next);
  return next;
}

export async function mirrorAppendOutput(args: {
  job: AgentJob;
  appendOutput: string;
}): Promise<void> {
  if (!args.appendOutput) return;
  try {
    const paired = await ensurePairedMessage(args.job);
    if (!paired) return;
    const sequence = await nextSequence(paired.messageId);
    if (paired.agentId) {
      // Use the message service so the 250ms-debounced broadcast fires.
      await appendMessageChunkSvc({
        messageId: paired.messageId,
        agentId: paired.agentId,
        chunks: [{ sequence, delta: args.appendOutput }],
      });
    } else {
      // SYSTEM-authored — bypass the agent-mismatch check by writing chunks
      // directly. We still want a STREAMING transition + broadcast.
      await prisma.messageChunk.createMany({
        data: [{ messageId: paired.messageId, sequence, delta: args.appendOutput }],
        skipDuplicates: true,
      });
      await prisma.message.updateMany({
        where: { id: paired.messageId, status: "PENDING" },
        data: { status: "STREAMING" },
      });
    }
  } catch (error) {
    // Mirroring failures must never break the underlying AgentJob update path.
    logger.error("mirrorAppendOutput.failed", {
      jobId: args.job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function mirrorJobTerminal(args: {
  job: AgentJob;
  status: "SUCCEEDED" | "FAILED" | "CANCELED";
  finalOutput: string;
}): Promise<void> {
  try {
    const messageStatus = args.status === "SUCCEEDED" ? "COMPLETE" : "ERROR";
    let paired = await prisma.message.findUnique({
      where: { agentJobId: args.job.id },
      select: { id: true, authorAgentId: true },
    });
    // Self-heal: if the terminal call raced ahead of the first append,
    // no paired message exists yet. Create it directly in the terminal
    // state so the row never gets stuck in STREAMING/PENDING.
    if (!paired) {
      if (!args.job.workspaceId || !args.job.ticketId) return;
      const conversation = await getOrCreateConversationForTicket(args.job.ticketId);
      const role = args.job.agentId ? "AGENT" : "SYSTEM";
      const created = await prisma.message.upsert({
        where: { agentJobId: args.job.id },
        create: {
          idempotencyKey: `agent-job:${args.job.id}`,
          conversationId: conversation.id,
          workspaceId: args.job.workspaceId,
          role,
          authorAgentId: role === "AGENT" ? args.job.agentId : null,
          agentJobId: args.job.id,
          body: args.finalOutput,
          status: messageStatus,
        },
        update: {},
        select: { id: true, authorAgentId: true, status: true },
      });
      // If upsert hit the existing row created by a racing append, fall
      // through to the finalize path below; otherwise we're done.
      if (created.status === messageStatus) {
        sequenceCursors.delete(created.id);
        return;
      }
      paired = { id: created.id, authorAgentId: created.authorAgentId };
    }
    if (paired.authorAgentId) {
      await finalizeMessageSvc({
        messageId: paired.id,
        agentId: paired.authorAgentId,
        status: messageStatus,
        body: args.finalOutput,
      });
    } else {
      await prisma.message.update({
        where: { id: paired.id },
        data: { body: args.finalOutput, status: messageStatus },
      });
    }
    sequenceCursors.delete(paired.id);
  } catch (error) {
    logger.error("mirrorJobTerminal.failed", {
      jobId: args.job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

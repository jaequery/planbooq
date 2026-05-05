"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishAgentEvent } from "@/server/ably";
import { generatePairCode } from "@/server/agent-auth";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

async function requireSessionUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const m = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!m) throw new Error("forbidden");
}

const PAIR_CODE_TTL_MS = 10 * 60 * 1000;

export type AgentSummary = {
  id: string;
  name: string;
  hostname: string | null;
  platform: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

const ListSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function listAgents(
  input: z.infer<typeof ListSchema>,
): Promise<ServerActionResult<AgentSummary[]>> {
  try {
    const { workspaceId } = ListSchema.parse(input);
    const userId = await requireSessionUser();
    await requireMembership(workspaceId, userId);
    const agents = await prisma.agent.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        hostname: true,
        platform: true,
        lastSeenAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });
    return { ok: true, data: agents };
  } catch (e) {
    logger.error("listAgents.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const CreateCodeSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function createPairCode(
  input: z.infer<typeof CreateCodeSchema>,
): Promise<ServerActionResult<{ code: string; expiresAt: Date }>> {
  try {
    const { workspaceId } = CreateCodeSchema.parse(input);
    const userId = await requireSessionUser();
    await requireMembership(workspaceId, userId);
    const code = generatePairCode();
    const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MS);
    await prisma.agentPairCode.create({
      data: { code, userId, expiresAt },
    });
    return { ok: true, data: { code, expiresAt } };
  } catch (e) {
    logger.error("createPairCode.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const PollSchema = z.object({ code: z.string().min(1) }).strict();

export async function pollPairCode(
  input: z.infer<typeof PollSchema>,
): Promise<ServerActionResult<{ status: "pending" | "claimed" | "expired"; agentId?: string }>> {
  try {
    const { code } = PollSchema.parse(input);
    const userId = await requireSessionUser();
    const row = await prisma.agentPairCode.findUnique({ where: { code } });
    if (!row || row.userId !== userId) return { ok: true, data: { status: "expired" } };
    if (row.expiresAt < new Date()) return { ok: true, data: { status: "expired" } };
    if (row.claimedAt && row.agentId)
      return { ok: true, data: { status: "claimed", agentId: row.agentId } };
    return { ok: true, data: { status: "pending" } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const DispatchSchema = z
  .object({
    ticketId: z.string().min(1),
    agentId: z.string().min(1),
    prompt: z.string().min(1).max(20000).optional(),
  })
  .strict();

export async function dispatchTicketToAgent(
  input: z.infer<typeof DispatchSchema>,
): Promise<ServerActionResult<{ jobId: string }>> {
  try {
    const { ticketId, agentId, prompt } = DispatchSchema.parse(input);
    const userId = await requireSessionUser();
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, workspaceId: true, title: true, description: true, projectId: true },
    });
    if (!ticket) throw new Error("ticket_not_found");
    await requireMembership(ticket.workspaceId, userId);
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== userId || agent.revokedAt) throw new Error("agent_not_found");
    if (agent.workspaceId !== ticket.workspaceId) throw new Error("agent_workspace_mismatch");

    const finalPrompt =
      prompt ?? [`# ${ticket.title}`, ticket.description ?? ""].filter(Boolean).join("\n\n").trim();

    const job = await prisma.agentJob.create({
      data: {
        agentId: agent.id,
        ticketId: ticket.id,
        prompt: finalPrompt,
        status: "PENDING",
      },
      select: { id: true },
    });

    await publishAgentEvent(agent.id, "job.dispatch", {
      jobId: job.id,
      ticketId: ticket.id,
      prompt: finalPrompt,
    });

    return { ok: true, data: { jobId: job.id } };
  } catch (e) {
    logger.error("dispatchTicketToAgent.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const RevokeSchema = z.object({ agentId: z.string().min(1) }).strict();

export async function revokeAgent(
  input: z.infer<typeof RevokeSchema>,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const { agentId } = RevokeSchema.parse(input);
    const userId = await requireSessionUser();
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== userId) throw new Error("not_found");
    await prisma.agent.update({
      where: { id: agentId },
      data: { revokedAt: new Date() },
    });
    revalidatePath("/settings/agents");
    return { ok: true, data: { id: agentId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { generateTicketPlan } from "@/server/openrouter";
import { createAgentJobForTicket, pickAgentForUser } from "@/server/services/agent-jobs";
import { createCommentSvc } from "@/server/services/comments";
import { moveTicketToStatusKey } from "@/server/services/ticket-status";

async function requireUserId(): Promise<string> {
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

const PlanSchema = z.object({ ticketId: z.string().min(1) }).strict();

export async function planTicket(
  input: z.infer<typeof PlanSchema>,
): Promise<ServerActionResult<{ ticketId: string }>> {
  try {
    const { ticketId } = PlanSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        title: true,
        description: true,
        archivedAt: true,
      },
    });
    if (!ticket || ticket.archivedAt) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const project = await prisma.project.findUnique({
      where: { id: ticket.projectId },
      select: { description: true, techStack: true },
    });
    const projectContext =
      [project?.description, project?.techStack].filter(Boolean).join("\n\n") || null;

    const result = await generateTicketPlan({
      workspaceId: ticket.workspaceId,
      title: ticket.title,
      description: ticket.description,
      projectContext,
    });
    if (!result.ok) return { ok: false, error: result.error };

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { plan: result.content },
    });

    await moveTicketToStatusKey({
      ticketId: ticket.id,
      toStatusKey: "todo",
      byUserId: userId,
    });

    return { ok: true, data: { ticketId: ticket.id } };
  } catch (e) {
    logger.error("planTicket.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const ExecuteDesktopSchema = z.object({ ticketId: z.string().min(1) }).strict();

/**
 * Desktop variant of Execute. The actual Claude Code session is spawned
 * client-side via the desktop bridge, so this server action only:
 *   - validates the ticket and membership,
 *   - moves the ticket to "building",
 *   - adds the dispatch comment,
 *   - returns the prompt (title + description + active plan) the client
 *     should feed into bridge.agentStart as the first message.
 *
 * Compared to the paired-agent flow, no AgentJob row is created here — the
 * client opens it via POST /api/tickets/:id/desktop-jobs so we get the
 * jobId before agentStart, register it with the global session manager, and
 * stream/persist via the same path Plan and Chat use.
 */
export async function executeTicketDesktop(
  input: z.infer<typeof ExecuteDesktopSchema>,
): Promise<
  ServerActionResult<{
    prompt: string;
    title: string;
    description: string | null;
    identifier: string;
  }>
> {
  try {
    const { ticketId } = ExecuteDesktopSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        description: true,
        plan: true,
        archivedAt: true,
      },
    });
    if (!ticket || ticket.archivedAt) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const planSection = ticket.plan ? `\n\n## Implementation plan\n\n${ticket.plan}` : "";
    const prompt = `# ${ticket.title}\n\n${ticket.description ?? ""}${planSection}`.trim();

    await moveTicketToStatusKey({
      ticketId: ticket.id,
      toStatusKey: "building",
      byUserId: userId,
    });

    // Meticulous "build started" comment in the supabuild style. Branch /
    // worktree are filled in by a follow-up `pbq comment` from the client
    // once `bridge.agentStart` has resolved them — we don't know them here
    // because the worktree is created locally on the user's machine.
    const lines = [
      "### 🛠️ Build started",
      "",
      "- **Mode:** Claude Code in an isolated git worktree on the paired desktop",
      "- **Context:** ticket title + description" + (ticket.plan ? " + implementation plan" : ""),
      "- **Wrapper:** Claude has `./.planbooq/pbq` for ticket reads, comments, ship, and error",
      "",
      "Next: when the build is clean Claude opens a PR via `gh pr create` and ships back via `pbq ship` — status moves to **Review**. On failure, label `error` is added and the ticket stays in **Building**.",
    ];
    await createCommentSvc(userId, {
      ticketId: ticket.id,
      body: lines.join("\n"),
    });

    return {
      ok: true,
      data: {
        prompt,
        title: ticket.title,
        description: ticket.description,
        identifier: ticket.id.slice(-6).toUpperCase(),
      },
    };
  } catch (e) {
    logger.error("executeTicketDesktop.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const ExecuteSchema = z.object({ ticketId: z.string().min(1) }).strict();

export async function executeTicket(
  input: z.infer<typeof ExecuteSchema>,
): Promise<ServerActionResult<{ jobId: string }>> {
  try {
    const { ticketId } = ExecuteSchema.parse(input);
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        title: true,
        description: true,
        plan: true,
        archivedAt: true,
      },
    });
    if (!ticket || ticket.archivedAt) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const agent = await pickAgentForUser({
      workspaceId: ticket.workspaceId,
      userId,
    });
    if (!agent) return { ok: false, error: "no_agent_paired" };

    const planSection = ticket.plan ? `\n\n## Implementation plan\n\n${ticket.plan}` : "";
    const prompt = `# ${ticket.title}\n\n${ticket.description ?? ""}${planSection}`.trim();

    const { jobId } = await createAgentJobForTicket({
      agentId: agent.id,
      ticketId: ticket.id,
      prompt,
    });

    await moveTicketToStatusKey({
      ticketId: ticket.id,
      toStatusKey: "building",
      byUserId: userId,
    });

    await createCommentSvc(userId, {
      ticketId: ticket.id,
      body: "**Dispatched to agent** — moved to Building.",
    });

    return { ok: true, data: { jobId } };
  } catch (e) {
    logger.error("executeTicket.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

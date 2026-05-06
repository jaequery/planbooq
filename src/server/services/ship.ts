import "server-only";

import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { prisma } from "@/server/db";
import { createCommentSvc } from "@/server/services/comments";
import { moveTicketToStatusKey } from "@/server/services/ticket-status";

/**
 * Shipping & error workflow used by Claude Code sessions running on a
 * paired desktop. Mirrors the supabuild Linear ritual: state change *first*,
 * then a meticulous comment with branch / target / diff / PR link, then any
 * label changes. Comments are intentionally rich markdown so they stay
 * scannable in the ticket activity feed and in slack-style mirrors.
 *
 * The wrapper script that Claude calls (`./.planbooq/pbq ship | error`)
 * hits the v1 API which calls into these helpers.
 */

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

async function ensureLabel(
  workspaceId: string,
  name: string,
  color: string,
): Promise<{ id: string }> {
  const existing = await prisma.label.findUnique({
    where: { workspaceId_name: { workspaceId, name } },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.label.create({
    data: { workspaceId, name, color },
    select: { id: true },
  });
}

export const ShipTicketSchema = z
  .object({
    prUrl: z.string().url(),
    summary: z.string().max(2000).optional(),
    branch: z.string().max(200).optional(),
    targetBranch: z.string().max(200).optional(),
    filesChanged: z.number().int().nonnegative().optional(),
    additions: z.number().int().nonnegative().optional(),
    deletions: z.number().int().nonnegative().optional(),
  })
  .strict();

/**
 * Mark a ticket as ready-for-review with a PR attached. Mutations, in the
 * order supabuild prescribes (state first, then comment, then job
 * bookkeeping):
 *
 *   1. Persist `Ticket.prUrl`.
 *   2. Move status → `review`.
 *   3. Mark the latest RUNNING EXECUTE AgentJob as SUCCEEDED so the live
 *      indicator on the board card stops pulsing.
 *   4. Post a meticulous "PR ready" comment.
 */
export async function shipTicketSvc(
  userId: string,
  ticketId: string,
  input: z.infer<typeof ShipTicketSchema>,
): Promise<ServerActionResult<{ ticketId: string; prUrl: string }>> {
  try {
    const data = ShipTicketSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        archivedAt: true,
      },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };
    await requireMembership(ticket.workspaceId, userId);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { prUrl: data.prUrl },
    });

    await moveTicketToStatusKey({
      ticketId: ticket.id,
      toStatusKey: "review",
      byUserId: userId,
    });

    // Best-effort: close out the active EXECUTE job so cards stop pulsing.
    const runningJob = await prisma.agentJob.findFirst({
      where: { ticketId: ticket.id, kind: "EXECUTE", status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (runningJob) {
      await prisma.agentJob.update({
        where: { id: runningJob.id },
        data: { status: "SUCCEEDED", finishedAt: new Date(), exitCode: 0 },
      });
    }

    const lines: string[] = [];
    lines.push("### ✅ PR ready — moved to **Review**");
    lines.push("");
    lines.push(`- **PR:** ${data.prUrl}`);
    if (data.branch || data.targetBranch) {
      const branchPart = data.branch ? `\`${data.branch}\`` : "_unknown_";
      const targetPart = data.targetBranch ? `\`${data.targetBranch}\`` : "_unknown_";
      lines.push(`- **Branch:** ${branchPart} → **base:** ${targetPart}`);
    }
    if (
      typeof data.filesChanged === "number" ||
      typeof data.additions === "number" ||
      typeof data.deletions === "number"
    ) {
      const parts: string[] = [];
      if (typeof data.additions === "number") parts.push(`+${data.additions}`);
      if (typeof data.deletions === "number") parts.push(`−${data.deletions}`);
      if (typeof data.filesChanged === "number") {
        parts.push(`across ${data.filesChanged} file${data.filesChanged === 1 ? "" : "s"}`);
      }
      lines.push(`- **Diff:** ${parts.join(" ")}`);
    }
    if (data.summary) {
      lines.push("");
      lines.push("> " + data.summary.replace(/\n+/g, " ").trim());
    }
    lines.push("");
    lines.push("Next: a human reviews the PR. Merging is intentionally manual.");

    await createCommentSvc(userId, {
      ticketId: ticket.id,
      body: lines.join("\n"),
    });

    return { ok: true, data: { ticketId: ticket.id, prUrl: data.prUrl } };
  } catch (e) {
    logger.error("shipTicketSvc.failed", {
      ticketId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export const ErrorTicketSchema = z
  .object({
    reason: z.string().min(1).max(4000),
    where: z.string().max(200).optional(),
  })
  .strict();

/**
 * Surface a build/ship failure on a ticket without moving it. Per the user's
 * preference (mirrors supabuild's "leave in started state, never auto-close
 * on failure"): keep status = building, attach `error` label, post a
 * meticulous failure comment, and mark the active EXECUTE job FAILED so the
 * live indicator stops.
 */
export async function errorTicketSvc(
  userId: string,
  ticketId: string,
  input: z.infer<typeof ErrorTicketSchema>,
): Promise<ServerActionResult<{ ticketId: string }>> {
  try {
    const data = ErrorTicketSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        workspaceId: true,
        archivedAt: true,
        labels: { select: { id: true } },
      },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };
    await requireMembership(ticket.workspaceId, userId);

    const label = await ensureLabel(ticket.workspaceId, "error", "#ef4444");
    if (!ticket.labels.some((l) => l.id === label.id)) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { labels: { connect: { id: label.id } } },
      });
    }

    const runningJob = await prisma.agentJob.findFirst({
      where: { ticketId: ticket.id, kind: "EXECUTE", status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (runningJob) {
      await prisma.agentJob.update({
        where: { id: runningJob.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: data.reason.slice(0, 4000),
        },
      });
    }

    const lines: string[] = [];
    lines.push("### ❌ Build failed");
    lines.push("");
    if (data.where) lines.push(`- **Where:** \`${data.where}\``);
    lines.push("- **Reason:**");
    lines.push("");
    lines.push("```");
    lines.push(data.reason.trim());
    lines.push("```");
    lines.push("");
    lines.push(
      "Ticket left in **Building**. Label `error` added. Open the agent panel to inspect the session log; restart by running Execute again.",
    );

    await createCommentSvc(userId, {
      ticketId: ticket.id,
      body: lines.join("\n"),
    });

    return { ok: true, data: { ticketId: ticket.id } };
  } catch (e) {
    logger.error("errorTicketSvc.failed", {
      ticketId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

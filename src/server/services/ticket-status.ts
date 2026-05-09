import "server-only";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { getPrStatusForUser, parseGitHubPrUrl } from "@/server/services/github-pr";
import { inngest } from "@/server/inngest/client";

/**
 * Move a ticket to the status with the given key (e.g. "todo", "building").
 * Appends to the end of the destination column. Shared by drag-reorder and
 * status-aware CTAs.
 */
export async function moveTicketToStatusKey(args: {
  ticketId: string;
  toStatusKey: string;
  byUserId: string;
}): Promise<{ fromStatusId: string; toStatusId: string; position: number } | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      statusId: true,
      archivedAt: true,
    },
  });
  if (!ticket || ticket.archivedAt) return null;

  const target = await prisma.status.findUnique({
    where: {
      workspaceId_key: { workspaceId: ticket.workspaceId, key: args.toStatusKey },
    },
    select: { id: true },
  });
  if (!target) return null;

  const fromStatusId = ticket.statusId;
  if (fromStatusId === target.id) {
    return { fromStatusId, toStatusId: target.id, position: 0 };
  }

  const last = await prisma.ticket.findFirst({
    where: {
      statusId: target.id,
      projectId: ticket.projectId,
      workspaceId: ticket.workspaceId,
      archivedAt: null,
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + 1;

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { statusId: target.id, position },
  });

  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
    select: { slug: true },
  });
  if (project) revalidatePath(`/p/${project.slug}`);

  await publishWorkspaceEvent(ticket.workspaceId, {
    name: "ticket.moved",
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    projectId: ticket.projectId,
    fromStatusId,
    toStatusId: target.id,
    position,
    by: args.byUserId,
  });

  void inngest
    .send({
      name: "ticket/moved",
      data: { ticketId: ticket.id, workspaceId: ticket.workspaceId },
    })
    .catch((error: unknown) => {
      logger.warn("inngest.send.failed", {
        name: "ticket/moved",
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return { fromStatusId, toStatusId: target.id, position };
}

/**
 * Server-authoritative reconciliation for tickets that the renderer-side
 * `decideEndOfRun` may have failed to demote out of `building`. Safe to call
 * unconditionally — no-ops unless the ticket is currently `building` and no
 * other RUNNING AgentJob exists for it.
 *
 * Status pick: PR-based when possible (review/completed/blocked); otherwise
 * `todo` so the card is no longer falsely "Running" and the user can decide
 * what to do next.
 */
export async function reconcileBuildingTicket(args: {
  ticketId: string;
  byUserId?: string | null;
  excludeJobId?: string | null;
}): Promise<{ moved: string | null; reason: string }> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: {
      id: true,
      workspaceId: true,
      prUrl: true,
      createdById: true,
      status: { select: { key: true } },
    },
  });
  if (!ticket) return { moved: null, reason: "not_found" };
  if (ticket.status?.key !== "building") {
    return { moved: null, reason: "not-building" };
  }

  // Bail if any sibling job is still actively running — another tab/run owns
  // the ticket; let it transition normally.
  const liveSibling = await prisma.agentJob.findFirst({
    where: {
      ticketId: args.ticketId,
      status: "RUNNING",
      ...(args.excludeJobId ? { id: { not: args.excludeJobId } } : {}),
    },
    select: { id: true },
  });
  if (liveSibling) return { moved: null, reason: "sibling-running" };

  const statuses = await prisma.status.findMany({
    where: { workspaceId: ticket.workspaceId },
    select: { key: true },
  });
  const allowed = new Set(statuses.map((s) => s.key));
  const pick = (k: string): string | null => (allowed.has(k) ? k : null);
  const byUserId = args.byUserId ?? ticket.createdById;

  let target: string | null = null;
  let reason = "no-pr";

  const pr = ticket.prUrl ? parseGitHubPrUrl(ticket.prUrl) : null;
  if (pr && byUserId) {
    try {
      const outcome = await getPrStatusForUser({ userId: byUserId, pr });
      if (outcome.kind === "ok") {
        const s = outcome.status;
        if (s.merged) {
          target = pick("completed") ?? pick("review");
          reason = "pr-merged";
        } else if (s.state === "closed") {
          target = pick("blocked") ?? pick("review");
          reason = "pr-closed";
        } else if (s.mergeable === false) {
          target = pick("blocked") ?? pick("review");
          reason = "pr-conflict";
        } else {
          target = pick("review");
          reason = "pr-open";
        }
      } else {
        reason = `pr-${outcome.kind}`;
      }
    } catch (error) {
      logger.warn("ticket.reconcile.pr-lookup-failed", {
        ticketId: args.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!target) target = pick("todo");
  if (!target || target === "building") {
    return { moved: null, reason: `${reason}-noop` };
  }

  await moveTicketToStatusKey({
    ticketId: ticket.id,
    toStatusKey: target,
    byUserId: byUserId ?? ticket.createdById,
  });
  logger.info("ticket.reconciled", {
    ticketId: ticket.id,
    target,
    reason,
  });
  return { moved: target, reason };
}

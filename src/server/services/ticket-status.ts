import "server-only";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { getPrStatusForUser, parseGitHubPrUrl } from "@/server/services/github-pr";
import { recordStatusChangedActivity } from "@/server/services/ticket-activity";

type MoveCleanup = {
  worktreePath: string;
  branch: string | null;
};

type TicketMoveResult = {
  fromStatusId: string;
  toStatusId: string;
  position: number;
  workspaceId: string;
  projectId: string;
};

/**
 * Canonical status transition path. Every caller that moves a ticket should
 * use this so the DB update, activity row, cache invalidation, and realtime
 * event stay in lockstep.
 */
export async function moveTicketToStatusId(args: {
  ticketId: string;
  toStatusId: string;
  by: string;
  activityByUserId?: string | null;
  beforeTicketId?: string | null;
  afterTicketId?: string | null;
  cleanup?: MoveCleanup | null;
}): Promise<TicketMoveResult> {
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
  if (!ticket) throw new Error("ticket_not_found");
  if (ticket.archivedAt) throw new Error("ticket_archived");

  const target = await prisma.status.findUnique({ where: { id: args.toStatusId } });
  if (!target || target.workspaceId !== ticket.workspaceId) throw new Error("invalid_status");

  const toStatusId = target.id;
  const fromStatusId = ticket.statusId;
  const beforeTicketId = args.beforeTicketId ?? null;
  const afterTicketId = args.afterTicketId ?? null;
  if (fromStatusId === toStatusId && !beforeTicketId && !afterTicketId) {
    return {
      fromStatusId,
      toStatusId,
      position: 0,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
    };
  }

  const position = await prisma.$transaction(async (tx) => {
    const [before, after] = await Promise.all([
      beforeTicketId
        ? tx.ticket.findUnique({ where: { id: beforeTicketId } })
        : Promise.resolve(null),
      afterTicketId
        ? tx.ticket.findUnique({ where: { id: afterTicketId } })
        : Promise.resolve(null),
    ]);

    if (beforeTicketId) {
      if (
        !before ||
        before.workspaceId !== ticket.workspaceId ||
        before.projectId !== ticket.projectId ||
        before.statusId !== toStatusId ||
        before.archivedAt
      ) {
        throw new Error("invalid_anchor_before");
      }
    }
    if (afterTicketId) {
      if (
        !after ||
        after.workspaceId !== ticket.workspaceId ||
        after.projectId !== ticket.projectId ||
        after.statusId !== toStatusId ||
        after.archivedAt
      ) {
        throw new Error("invalid_anchor_after");
      }
    }

    let nextPosition: number;
    if (before && after) {
      nextPosition = (before.position + after.position) / 2;
    } else if (after && !before) {
      nextPosition = after.position + 1;
    } else if (before && !after) {
      nextPosition = before.position - 1;
    } else {
      const last = await tx.ticket.findFirst({
        where: {
          statusId: toStatusId,
          projectId: ticket.projectId,
          workspaceId: ticket.workspaceId,
          archivedAt: null,
        },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      nextPosition = (last?.position ?? 0) + 1;
    }

    const result = await tx.ticket.updateMany({
      where: { id: ticket.id, workspaceId: ticket.workspaceId },
      data: { statusId: toStatusId, position: nextPosition },
    });
    if (result.count !== 1) throw new Error("ticket_update_failed");
    return nextPosition;
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
    toStatusId,
    // Subscribers that need to react to specific columns (e.g. the chat
    // panel killing a live agent session when the ticket lands in
    // `blocked`) shouldn't have to do a second status lookup. `target` was
    // already fetched above, so this is a free derivation.
    toStatusKey: target.key,
    position,
    by: args.by,
    cleanup: args.cleanup,
  });

  await recordStatusChangedActivity({
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    fromStatusId,
    toStatusId,
    byUserId: args.activityByUserId ?? args.by,
  });

  return {
    fromStatusId,
    toStatusId,
    position,
    workspaceId: ticket.workspaceId,
    projectId: ticket.projectId,
  };
}

/**
 * Move a ticket to the status with the given key (e.g. "todo", "building").
 * Appends to the end of the destination column. Shared by status-aware CTAs.
 */
export async function moveTicketToStatusKey(args: {
  ticketId: string;
  toStatusKey: string;
  byUserId: string;
}): Promise<TicketMoveResult | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: { workspaceId: true, projectId: true, archivedAt: true, statusId: true },
  });
  if (!ticket || ticket.archivedAt) return null;

  const target = await prisma.status.findUnique({
    where: {
      workspaceId_key: { workspaceId: ticket.workspaceId, key: args.toStatusKey },
    },
    select: { id: true },
  });
  if (!target) return null;
  if (ticket.statusId === target.id) {
    return {
      fromStatusId: ticket.statusId,
      toStatusId: target.id,
      position: 0,
      workspaceId: ticket.workspaceId,
      projectId: ticket.projectId,
    };
  }

  return moveTicketToStatusId({
    ticketId: args.ticketId,
    toStatusId: target.id,
    by: args.byUserId,
    activityByUserId: args.byUserId,
  });
}

/**
 * Auto-transition a ticket to "todo" once a plan exists. Fires when the
 * ticket is currently sitting in a pre-work column ("backlog" or "planning").
 * No-op otherwise, or when the workspace has no "todo" status to land on.
 * Returns true when a move actually happened so callers can refetch.
 */
export async function autoTransitionPlanningToTodo(args: {
  ticketId: string;
  byUserId: string;
}): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: { archivedAt: true, status: { select: { key: true } } },
  });
  if (!ticket || ticket.archivedAt) return false;
  const fromKey = ticket.status?.key;
  if (fromKey !== "backlog" && fromKey !== "planning") return false;

  const moved = await moveTicketToStatusKey({
    ticketId: args.ticketId,
    toStatusKey: "todo",
    byUserId: args.byUserId,
  });
  return Boolean(moved && moved.fromStatusId !== moved.toStatusId);
}

/**
 * Server-authoritative reconciliation for tickets that the renderer-side
 * `decideEndOfRun` may have failed to demote out of `building`. Safe to call
 * unconditionally — no-ops unless the ticket is currently `building` and no
 * other RUNNING AgentJob exists for it.
 *
 * Status pick:
 *   - PR present: outcome of the PR (review/completed/blocked).
 *   - No PR, jobStatus=CANCELED: user explicitly stopped → `todo`.
 *   - No PR, jobStatus=SUCCEEDED or FAILED (or unknown): the agent yielded
 *     its turn without shipping a PR, which in this product can only mean
 *     "waiting on the human" → `blocked`. Erring toward `blocked` over `todo`
 *     keeps stranded cards visible instead of silently bucketed.
 */
export async function reconcileBuildingTicket(args: {
  ticketId: string;
  byUserId?: string | null;
  excludeJobId?: string | null;
  jobStatus?: "SUCCEEDED" | "FAILED" | "CANCELED" | null;
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

  if (!target) {
    // No PR (or PR lookup failed). The triggering job's status decides the
    // fallback: an explicit user-Stop = `todo`; any other terminal state
    // (clean turn end with no PR, hard process failure, unknown) = `blocked`,
    // because the agent has stopped and a human needs to look at the card.
    if (args.jobStatus === "CANCELED") {
      target = pick("todo");
      reason = `${reason}-canceled`;
    } else {
      target = pick("blocked") ?? pick("todo");
      reason = `${reason}-${args.jobStatus?.toLowerCase() ?? "unknown"}`;
    }
  }
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

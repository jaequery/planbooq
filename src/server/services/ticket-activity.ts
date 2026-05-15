import "server-only";

import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

export async function recordStatusChangedActivity(args: {
  ticketId: string;
  workspaceId: string;
  fromStatusId: string;
  toStatusId: string;
  byUserId: string | null;
}): Promise<void> {
  if (args.fromStatusId === args.toStatusId) return;
  try {
    const [from, to] = await Promise.all([
      prisma.status.findUnique({
        where: { id: args.fromStatusId },
        select: { key: true, name: true },
      }),
      prisma.status.findUnique({
        where: { id: args.toStatusId },
        select: { key: true, name: true },
      }),
    ]);

    const payload = {
      fromStatusId: args.fromStatusId,
      toStatusId: args.toStatusId,
      fromKey: from?.key ?? null,
      toKey: to?.key ?? null,
      fromName: from?.name ?? null,
      toName: to?.name ?? null,
      byUserId: args.byUserId,
    };

    const activity = await prisma.ticketActivity.create({
      data: {
        ticketId: args.ticketId,
        workspaceId: args.workspaceId,
        kind: "STATUS_CHANGED",
        payload: payload as Prisma.InputJsonValue,
      },
      select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
    });

    await publishWorkspaceEvent(args.workspaceId, {
      name: "ticket.activity",
      workspaceId: args.workspaceId,
      ticketId: args.ticketId,
      activity: {
        id: activity.id,
        kind: activity.kind,
        payload: activity.payload as Record<string, unknown>,
        jobId: activity.jobId,
        createdAt: activity.createdAt.toISOString(),
      },
    });
  } catch (error) {
    // Elevated from warn to error: a missed STATUS_CHANGED row leaves the
    // activity log inconsistent with the DB (the canonical move already
    // committed in moveTicketToStatusId). The two IDs make the lost
    // transition greppable against the ticket's row.
    logger.error("ticketActivity.status-changed.failed", {
      ticketId: args.ticketId,
      workspaceId: args.workspaceId,
      fromStatusId: args.fromStatusId,
      toStatusId: args.toStatusId,
      byUserId: args.byUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function recordPrMergedActivity(args: {
  ticketId: string;
  workspaceId: string;
  prUrl: string;
  prTitle: string | null;
  prNumber: number | null;
  prActor: string | null;
  byUserId: string | null;
  sha: string | null;
}): Promise<void> {
  try {
    const payload = {
      prUrl: args.prUrl,
      prTitle: args.prTitle,
      prNumber: args.prNumber,
      prActor: args.prActor,
      byUserId: args.byUserId,
      sha: args.sha,
    };

    const activity = await prisma.ticketActivity.create({
      data: {
        ticketId: args.ticketId,
        workspaceId: args.workspaceId,
        kind: "PR_MERGED",
        payload: payload as Prisma.InputJsonValue,
      },
      select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
    });

    await publishWorkspaceEvent(args.workspaceId, {
      name: "ticket.activity",
      workspaceId: args.workspaceId,
      ticketId: args.ticketId,
      activity: {
        id: activity.id,
        kind: activity.kind,
        payload: activity.payload as Record<string, unknown>,
        jobId: activity.jobId,
        createdAt: activity.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.warn("ticketActivity.pr-merged.failed", {
      ticketId: args.ticketId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function recordStepActivity(args: {
  ticketId: string;
  workspaceId: string;
  kind: "STEP_STARTED" | "STEP_COMPLETED";
  stepName: string;
  byUserId: string | null;
}): Promise<{ id: string } | null> {
  try {
    const activity = await prisma.ticketActivity.create({
      data: {
        ticketId: args.ticketId,
        workspaceId: args.workspaceId,
        kind: args.kind,
        payload: {
          name: args.stepName,
          byUserId: args.byUserId,
        } as Prisma.InputJsonValue,
      },
      select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
    });

    await publishWorkspaceEvent(args.workspaceId, {
      name: "ticket.activity",
      workspaceId: args.workspaceId,
      ticketId: args.ticketId,
      activity: {
        id: activity.id,
        kind: activity.kind,
        payload: activity.payload as Record<string, unknown>,
        jobId: activity.jobId,
        createdAt: activity.createdAt.toISOString(),
      },
    });
    return { id: activity.id };
  } catch (error) {
    logger.warn("ticketActivity.step.failed", {
      ticketId: args.ticketId,
      kind: args.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

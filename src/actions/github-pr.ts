"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  getPrStatusForUser,
  mergePrForUser,
  type PrStatus,
  parseGitHubPrUrl,
} from "@/server/services/github-pr";

const TICKET_RELATIONS_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
} as const;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

const TicketIdSchema = z.object({ ticketId: z.string().min(1) }).strict();

type StatusReason =
  | "no-pr-url"
  | "not-github"
  | "no-token"
  | "missing-scope"
  | "not-found"
  | "rate-limited"
  | "error";

type StatusOk = { status: PrStatus };
type StatusFallback = { status: null; reason: StatusReason; message?: string };

export async function getPullRequestStatus(
  ticketId: string,
): Promise<ServerActionResult<StatusOk | StatusFallback>> {
  try {
    const { ticketId: id } = TicketIdSchema.parse({ ticketId });
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        prUrl: true,
        workspaceId: true,
      },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const pr = parseGitHubPrUrl(ticket.prUrl);
    if (!ticket.prUrl) {
      return { ok: true, data: { status: null, reason: "no-pr-url" } };
    }
    if (!pr) {
      return { ok: true, data: { status: null, reason: "not-github" } };
    }

    const outcome = await getPrStatusForUser({ userId, pr });
    switch (outcome.kind) {
      case "ok":
        return { ok: true, data: { status: outcome.status } };
      case "no-token":
        return { ok: true, data: { status: null, reason: "no-token" } };
      case "missing-scope":
        return { ok: true, data: { status: null, reason: "missing-scope" } };
      case "not-found":
        return { ok: true, data: { status: null, reason: "not-found" } };
      case "rate-limited":
        return { ok: true, data: { status: null, reason: "rate-limited" } };
      default:
        return {
          ok: true,
          data: { status: null, reason: "error", message: outcome.message },
        };
    }
  } catch (error) {
    logger.error("github_pr.status.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

type MergeReason =
  | "no-pr-url"
  | "not-github"
  | "no-token"
  | "missing-scope"
  | "not-mergeable"
  | "conflict"
  | "rate-limited"
  | "error";

type MergeOk = { merged: true; sha: string };
type MergeFallback = { merged: false; reason: MergeReason; message?: string };

export async function mergePullRequest(
  ticketId: string,
): Promise<ServerActionResult<MergeOk | MergeFallback>> {
  try {
    const { ticketId: id } = TicketIdSchema.parse({ ticketId });
    const userId = await requireUserId();

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        prUrl: true,
        workspaceId: true,
        projectId: true,
        project: { select: { slug: true } },
      },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    if (!ticket.prUrl) {
      return { ok: true, data: { merged: false, reason: "no-pr-url" } };
    }
    const pr = parseGitHubPrUrl(ticket.prUrl);
    if (!pr) {
      return { ok: true, data: { merged: false, reason: "not-github" } };
    }

    const outcome = await mergePrForUser({ userId, pr });

    if (outcome.kind === "ok") {
      logger.info("github_pr.merge.ok", { ticketId: id, sha: outcome.sha });
      revalidatePath(`/p/${ticket.project.slug}`);

      const updated = await prisma.ticket.findUnique({
        where: { id },
        include: TICKET_RELATIONS_INCLUDE,
      });
      if (updated) {
        await publishWorkspaceEvent(ticket.workspaceId, {
          name: "ticket.updated",
          ticketId: updated.id,
          workspaceId: ticket.workspaceId,
          projectId: ticket.projectId,
          ticket: updated,
          by: userId,
        });
      }
      return { ok: true, data: { merged: true, sha: outcome.sha } };
    }

    logger.info("github_pr.merge.fail", { ticketId: id, reason: outcome.kind });
    switch (outcome.kind) {
      case "no-token":
        return { ok: true, data: { merged: false, reason: "no-token" } };
      case "missing-scope":
        return { ok: true, data: { merged: false, reason: "missing-scope" } };
      case "not-mergeable":
        return {
          ok: true,
          data: { merged: false, reason: "not-mergeable", message: outcome.message },
        };
      case "conflict":
        return {
          ok: true,
          data: { merged: false, reason: "conflict", message: outcome.message },
        };
      case "rate-limited":
        return { ok: true, data: { merged: false, reason: "rate-limited" } };
      default:
        return {
          ok: true,
          data: { merged: false, reason: "error", message: outcome.message },
        };
    }
  } catch (error) {
    logger.error("github_pr.merge.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

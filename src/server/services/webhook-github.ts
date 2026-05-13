import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { logger } from "@/lib/logger";
import { parseTicketRef } from "@/lib/ticket-identifier";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { recordPrMergedActivity } from "@/server/services/ticket-activity";
import {
  markPullRequestMerged,
  recordTicketPullRequest,
} from "@/server/services/ticket-pull-requests";
import { moveTicketToStatusId, reconcileBuildingTicket } from "@/server/services/ticket-status";

const SIGNATURE_PREFIX = "sha256=";

export function verifyGitHubSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

type AutoCompleteOutcome =
  | { kind: "no_match" }
  | { kind: "no_completed_status" }
  | { kind: "already_completed" }
  | { kind: "moved"; ticketId: string; workspaceId: string; toStatusId: string };

type LinkPrOutcome =
  | { kind: "no_identifier" }
  | { kind: "no_match" }
  | { kind: "already_linked" }
  | { kind: "linked"; ticketId: string; workspaceId: string };

const TICKET_RELATIONS_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
} as const;

const PLANBOOQ_REF_RE = /Closes\s+Planbooq\s+ticket:\s*([A-Za-z0-9-]+)/i;

export async function linkTicketPrUrlFromPrBody(
  prUrl: string,
  body: string | null | undefined,
): Promise<LinkPrOutcome> {
  const match = body?.match(PLANBOOQ_REF_RE);
  if (!match?.[1]) return { kind: "no_identifier" };
  const ref = parseTicketRef(match[1]);
  if (!ref) return { kind: "no_identifier" };

  const where =
    ref.kind === "canonical"
      ? {
          archivedAt: null,
          id: { endsWith: ref.idSuffix, mode: "insensitive" as const },
          project: { slug: { startsWith: ref.projectPrefix, mode: "insensitive" as const } },
        }
      : {
          archivedAt: null,
          id: { startsWith: ref.idPrefix, mode: "insensitive" as const },
        };

  const ticket = await prisma.ticket.findFirst({
    where,
    select: { id: true, workspaceId: true, projectId: true, prUrl: true },
  });
  if (!ticket) return { kind: "no_match" };

  // Always record the PR in history (idempotent on (ticketId, url)). This
  // captures PRs that came in via GitHub events even if Ticket.prUrl is
  // already pointing somewhere else.
  await recordTicketPullRequest({ ticketId: ticket.id, url: prUrl });

  if (ticket.prUrl === prUrl) return { kind: "already_linked" };

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { prUrl },
    include: TICKET_RELATIONS_INCLUDE,
  });

  await publishWorkspaceEvent(ticket.workspaceId, {
    name: "ticket.updated",
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    projectId: ticket.projectId,
    ticket: updated,
    by: "github-webhook",
  });

  // PR just opened against this ticket → if it's still in `building`,
  // demote it to review (or blocked on conflict). Otherwise the card
  // sits in Running until the cron watchdog notices.
  void reconcileBuildingTicket({ ticketId: ticket.id }).catch(() => undefined);

  return { kind: "linked", ticketId: ticket.id, workspaceId: ticket.workspaceId };
}

type MergeMetadata = {
  prTitle?: string | null;
  prNumber?: number | null;
  prActor?: string | null;
  byUserId?: string | null;
  sha?: string | null;
};

export async function autoCompleteTicketByPrUrl(
  prUrl: string,
  metadata: MergeMetadata = {},
): Promise<AutoCompleteOutcome> {
  // Mark the PR row as merged regardless of whether it's currently the
  // ticket's "active" pointer — a re-shipped ticket may have superseded
  // this PR locally before the merge webhook arrived.
  // `flipped` is the OPEN→MERGED transition count; we use it as the
  // idempotency gate for the activity log so duplicate webhooks don't
  // double-log.
  const { flipped } = await markPullRequestMerged(prUrl);

  const ticket = await prisma.ticket.findFirst({
    where: { prUrl, archivedAt: null },
    select: { id: true, workspaceId: true, projectId: true, statusId: true },
  });
  if (!ticket) return { kind: "no_match" };

  if (flipped > 0) {
    await recordPrMergedActivity({
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      prUrl,
      prTitle: metadata.prTitle ?? null,
      prNumber: metadata.prNumber ?? null,
      prActor: metadata.prActor ?? null,
      byUserId: metadata.byUserId ?? null,
      sha: metadata.sha ?? null,
    });
  }

  const completed = await prisma.status.findUnique({
    where: { workspaceId_key: { workspaceId: ticket.workspaceId, key: "completed" } },
    select: { id: true },
  });
  if (!completed) {
    logger.warn("github.webhook.no_completed_status", { workspaceId: ticket.workspaceId });
    return { kind: "no_completed_status" };
  }

  if (ticket.statusId === completed.id) return { kind: "already_completed" };

  // Collect cleanup pointers for the desktop renderer: the most recent
  // AgentJob that ran in a worktree for this ticket, plus the PR branch.
  // The desktop bridge uses these to `git worktree remove` after merge.
  // Best-effort — if either lookup fails, the event still fires without
  // cleanup data and the worktree just lingers (current behavior).
  const [latestJob, prRecord] = await Promise.all([
    prisma.agentJob.findFirst({
      where: { ticketId: ticket.id, worktreePath: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { worktreePath: true },
    }),
    prisma.ticketPullRequest.findFirst({
      where: { ticketId: ticket.id, url: prUrl },
      select: { branch: true },
    }),
  ]).catch(() => [null, null] as const);

  const cleanup = latestJob?.worktreePath
    ? { worktreePath: latestJob.worktreePath, branch: prRecord?.branch ?? null }
    : null;

  await moveTicketToStatusId({
    ticketId: ticket.id,
    toStatusId: completed.id,
    by: "github-webhook",
    activityByUserId: null,
    cleanup,
  });

  return {
    kind: "moved",
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    toStatusId: completed.id,
  };
}

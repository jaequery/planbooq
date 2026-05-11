import "server-only";

import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { getPrStatusForUser, parseGitHubPrUrl } from "@/server/services/github-pr";
import { autoCompleteTicketByPrUrl } from "@/server/services/webhook-github";

/**
 * Poll-based stand-in for GitHub webhooks. The Electron app is not publicly
 * reachable so webhooks have no destination; instead the board pings this
 * endpoint every ~8s while open (and on tab focus), and we walk every Review-status ticket
 * with a `prUrl` and ask GitHub whether the PR has merged. Merged → reuse
 * the same `autoCompleteTicketByPrUrl` the webhook handler uses, so the
 * downstream behavior (status move + Ably fanout) is identical.
 *
 * Scoped per user+workspace so we use the *user's* GitHub token (existing
 * OAuth account record) and only see tickets they're a member of.
 */

type PollOutcome =
  | { kind: "skipped"; reason: "no_review_tickets" | "no_token" | "missing_scope" }
  | { kind: "ok"; checked: number; moved: number; errors: number };

export async function pollMergedPrsForWorkspace(args: {
  userId: string;
  workspaceId: string;
}): Promise<PollOutcome> {
  const { userId, workspaceId } = args;

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  if (!member) return { kind: "skipped", reason: "no_review_tickets" };

  const reviewStatus = await prisma.status.findFirst({
    where: { workspaceId, key: "review" },
    select: { id: true },
  });
  if (!reviewStatus) return { kind: "skipped", reason: "no_review_tickets" };

  const tickets = await prisma.ticket.findMany({
    where: {
      workspaceId,
      statusId: reviewStatus.id,
      archivedAt: null,
      prUrl: { not: null },
    },
    select: { id: true, prUrl: true },
    take: 100,
  });
  if (tickets.length === 0) return { kind: "skipped", reason: "no_review_tickets" };

  let checked = 0;
  let moved = 0;
  let errors = 0;
  let tokenAvailable = true;
  let scopeOk = true;

  for (const t of tickets) {
    const pr = parseGitHubPrUrl(t.prUrl);
    if (!pr) continue;
    checked += 1;
    const status = await getPrStatusForUser({ userId, pr });
    if (status.kind === "no-token") {
      tokenAvailable = false;
      break;
    }
    if (status.kind === "missing-scope") {
      scopeOk = false;
      break;
    }
    if (status.kind === "rate-limited") {
      logger.warn("poll_prs.rate_limited", { workspaceId, ticketId: t.id });
      break;
    }
    if (status.kind !== "ok") {
      errors += 1;
      continue;
    }
    if (!status.status.merged) continue;

    const outcome = await autoCompleteTicketByPrUrl(pr.htmlUrl, {
      prTitle: status.status.title,
      prNumber: status.status.number,
      byUserId: userId,
    });
    if (outcome.kind === "moved") moved += 1;
  }

  if (!tokenAvailable) return { kind: "skipped", reason: "no_token" };
  if (!scopeOk) return { kind: "skipped", reason: "missing_scope" };
  return { kind: "ok", checked, moved, errors };
}

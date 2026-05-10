import "server-only";

import type { Prisma, TicketPullRequest } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * Pull request history per ticket. A ticket can have many PRs across its
 * lifetime (re-do after merge, follow-up changes). The legacy `Ticket.prUrl`
 * stays as a "current/latest" pointer; this table is the audit trail.
 *
 * Status transitions:
 *   - record (ship) → OPEN, prior OPEN rows on the ticket marked SUPERSEDED
 *   - webhook merge → MERGED
 *   - webhook closed (not merged) → CLOSED
 *
 * SUPERSEDED is sticky: once a row is SUPERSEDED we don't flip it back, even
 * if a late webhook fires for that PR.
 */

type RecordInput = {
  ticketId: string;
  url: string;
  branch?: string | null;
  targetBranch?: string | null;
  summary?: string | null;
  filesChanged?: number | null;
  additions?: number | null;
  deletions?: number | null;
};

/**
 * Record a freshly-shipped PR. Idempotent on (ticketId, url): if the row
 * already exists, we leave it alone (don't reset its status). Any prior
 * non-terminal (OPEN) rows on the ticket are marked SUPERSEDED so the
 * "active" PR pointer is unambiguous.
 */
export async function recordTicketPullRequest(
  input: RecordInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ row: TicketPullRequest; supersededUrls: string[] }> {
  const now = new Date();

  const superseded = await client.ticketPullRequest.findMany({
    where: {
      ticketId: input.ticketId,
      status: "OPEN",
      url: { not: input.url },
    },
    select: { url: true },
  });
  if (superseded.length > 0) {
    await client.ticketPullRequest.updateMany({
      where: {
        ticketId: input.ticketId,
        status: "OPEN",
        url: { not: input.url },
      },
      data: { status: "SUPERSEDED", supersededAt: now },
    });
  }

  const row = await client.ticketPullRequest.upsert({
    where: { ticketId_url: { ticketId: input.ticketId, url: input.url } },
    create: {
      ticketId: input.ticketId,
      url: input.url,
      status: "OPEN",
      branch: input.branch ?? null,
      targetBranch: input.targetBranch ?? null,
      summary: input.summary ?? null,
      filesChanged: input.filesChanged ?? null,
      additions: input.additions ?? null,
      deletions: input.deletions ?? null,
    },
    update: {
      // Refresh metadata if newer info came in, but don't touch status.
      branch: input.branch ?? undefined,
      targetBranch: input.targetBranch ?? undefined,
      summary: input.summary ?? undefined,
      filesChanged: input.filesChanged ?? undefined,
      additions: input.additions ?? undefined,
      deletions: input.deletions ?? undefined,
    },
  });

  return { row, supersededUrls: superseded.map((s) => s.url) };
}

/**
 * Backfill: tickets created before the TicketPullRequest table existed have
 * a `Ticket.prUrl` set but no history row. Insert a best-effort row so the
 * UI's PR history list isn't empty. We don't know the original status, so
 * mark it OPEN — a subsequent webhook (or manual fix) will correct it.
 */
export async function ensureLegacyPrRecorded(
  ticketId: string,
  prUrl: string,
): Promise<void> {
  await prisma.ticketPullRequest.upsert({
    where: { ticketId_url: { ticketId, url: prUrl } },
    create: { ticketId, url: prUrl, status: "OPEN" },
    update: {},
  });
}

export async function markPullRequestMerged(prUrl: string): Promise<void> {
  await prisma.ticketPullRequest.updateMany({
    where: { url: prUrl, status: "OPEN" },
    data: { status: "MERGED", mergedAt: new Date() },
  });
}

export async function markPullRequestClosed(prUrl: string): Promise<void> {
  await prisma.ticketPullRequest.updateMany({
    where: { url: prUrl, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}

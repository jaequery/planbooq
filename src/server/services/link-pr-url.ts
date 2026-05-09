import "server-only";

import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { parseGitHubPrUrl } from "@/server/services/github-pr";

const GITHUB_PR_URL_RE_GLOBAL = /https?:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/pull\/\d+/gi;

export function findFirstGitHubPrUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(GITHUB_PR_URL_RE_GLOBAL);
  if (!matches) return null;
  for (const raw of matches) {
    const parsed = parseGitHubPrUrl(raw);
    if (parsed) return parsed.htmlUrl;
  }
  return null;
}

/**
 * If `ticketId`'s prUrl is empty and `text` contains a GitHub PR URL, persist
 * it and fan out a `ticket.updated` event. No-op otherwise. Safe to call from
 * any path that ingests free-form agent output (chat, activity payloads,
 * comments) — that's the whole point: a single funnel so a PR mention anywhere
 * is enough to link the ticket.
 *
 * Returns the URL that was linked, or null.
 */
export async function maybeLinkPrUrlFromText(
  ticketId: string,
  text: string | null | undefined,
): Promise<string | null> {
  const url = findFirstGitHubPrUrl(text);
  if (!url) return null;
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, prUrl: true, archivedAt: true },
    });
    if (!ticket || ticket.archivedAt) return null;
    if (ticket.prUrl) return null;

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { prUrl: url },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true } },
        labels: { select: { id: true, name: true, color: true } },
      },
    });
    await publishWorkspaceEvent(updated.workspaceId, {
      name: "ticket.updated",
      ticketId: updated.id,
      workspaceId: updated.workspaceId,
      projectId: updated.projectId,
      ticket: updated,
      by: "agent",
    });
    return url;
  } catch (e) {
    logger.error("maybeLinkPrUrlFromText.failed", {
      ticketId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

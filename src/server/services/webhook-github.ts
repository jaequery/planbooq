import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

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

export async function autoCompleteTicketByPrUrl(prUrl: string): Promise<AutoCompleteOutcome> {
  const ticket = await prisma.ticket.findFirst({
    where: { prUrl, archivedAt: null },
    select: { id: true, workspaceId: true, projectId: true, statusId: true },
  });
  if (!ticket) return { kind: "no_match" };

  const completed = await prisma.status.findFirst({
    where: { workspaceId: ticket.workspaceId, name: { equals: "Completed", mode: "insensitive" } },
    select: { id: true },
  });
  if (!completed) {
    logger.warn("github.webhook.no_completed_status", { workspaceId: ticket.workspaceId });
    return { kind: "no_completed_status" };
  }

  if (ticket.statusId === completed.id) return { kind: "already_completed" };

  const fromStatusId = ticket.statusId;
  const finalPosition = await prisma.$transaction(async (tx) => {
    const last = await tx.ticket.findFirst({
      where: {
        statusId: completed.id,
        projectId: ticket.projectId,
        workspaceId: ticket.workspaceId,
        archivedAt: null,
      },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1;
    const r = await tx.ticket.updateMany({
      where: { id: ticket.id, workspaceId: ticket.workspaceId },
      data: { statusId: completed.id, position },
    });
    if (r.count !== 1) throw new Error("ticket_update_failed");
    return position;
  });

  await publishWorkspaceEvent(ticket.workspaceId, {
    name: "ticket.moved",
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    projectId: ticket.projectId,
    fromStatusId,
    toStatusId: completed.id,
    position: finalPosition,
    by: "github-webhook",
  });

  return {
    kind: "moved",
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    toStatusId: completed.id,
  };
}

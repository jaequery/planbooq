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

type LinkPrOutcome =
  | { kind: "no_identifier" }
  | { kind: "no_match" }
  | { kind: "already_linked" }
  | { kind: "linked"; ticketId: string; workspaceId: string };

const TICKET_RELATIONS_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
} as const;

const PLANBOOQ_REF_RE = /Closes\s+Planbooq\s+ticket:\s*([A-Za-z0-9]+)-([A-Za-z0-9]{6})\b/i;

export async function linkTicketPrUrlFromPrBody(
  prUrl: string,
  body: string | null | undefined,
): Promise<LinkPrOutcome> {
  const match = body?.match(PLANBOOQ_REF_RE);
  if (!match?.[1] || !match[2]) return { kind: "no_identifier" };
  const projectPrefix = match[1].toLowerCase();
  const idSuffix = match[2].toLowerCase();

  const ticket = await prisma.ticket.findFirst({
    where: {
      archivedAt: null,
      id: { endsWith: idSuffix, mode: "insensitive" },
      project: { slug: { startsWith: projectPrefix, mode: "insensitive" } },
    },
    select: { id: true, workspaceId: true, projectId: true, prUrl: true },
  });
  if (!ticket) return { kind: "no_match" };
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

  return { kind: "linked", ticketId: ticket.id, workspaceId: ticket.workspaceId };
}

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

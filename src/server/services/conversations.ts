import type { Conversation } from "@prisma/client";
import type { ServerActionResult } from "@/lib/types";
import { prisma } from "@/server/db";

async function requireMembership(workspaceId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

// Upsert keyed on ticketId closes the read-then-write race that two concurrent
// callers (e.g. user opens ticket while an agent fires a reply) would otherwise
// hit. ticketId is @unique so the upsert is atomic.
export async function getOrCreateConversationForTicket(ticketId: string): Promise<Conversation> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) throw new Error("ticket_not_found");
  return prisma.conversation.upsert({
    where: { ticketId: ticket.id },
    create: { ticketId: ticket.id, workspaceId: ticket.workspaceId },
    update: {},
  });
}

export async function getConversationForTicketSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<Conversation>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return { ok: false, error: "ticket_not_found" };
  try {
    await requireMembership(ticket.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const conversation = await getOrCreateConversationForTicket(ticket.id);
  return { ok: true, data: conversation };
}

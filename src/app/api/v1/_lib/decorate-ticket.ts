import { formatTicketIdentifier } from "@/lib/ticket-identifier";
import type { TicketWithRelations } from "@/lib/types";

export function withIdentifier<T extends TicketWithRelations>(ticket: T) {
  return { ...ticket, identifier: formatTicketIdentifier(ticket.project?.slug ?? null, ticket.id) };
}

export function withIdentifierList<T extends TicketWithRelations>(items: T[]) {
  return items.map(withIdentifier);
}

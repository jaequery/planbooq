export type PositionOrderedTicket = {
  id: string;
  position: number;
  updatedAt: Date | string;
};

export function compareTicketsByPosition(
  a: PositionOrderedTicket,
  b: PositionOrderedTicket,
): number {
  const diff = a.position - b.position;
  if (diff !== 0) return diff;
  const updatedDiff = +new Date(b.updatedAt) - +new Date(a.updatedAt);
  return updatedDiff !== 0 ? updatedDiff : a.id.localeCompare(b.id);
}

export function sortTicketsByPosition<T extends PositionOrderedTicket>(tickets: T[]): T[] {
  return [...tickets].sort(compareTicketsByPosition);
}

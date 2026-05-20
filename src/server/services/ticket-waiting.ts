import "server-only";

import { prisma } from "@/server/db";

// Statuses where the ticket's progress is blocked on a human action.
// `blocked` = workflow paused waiting for a Run click; `review` = PR waiting
// to be shipped/merged. `backlog`/`todo` are passive (not started), `building`
// is the Worker actively working, `completed` is terminal — none "wait" on a
// human in the sense this surfaces.
const HUMAN_WAITING_STATUS_KEYS: ReadonlySet<string> = new Set(["blocked", "review"]);

export function isHumanWaitingStatusKey(key: string | null | undefined): boolean {
  return !!key && HUMAN_WAITING_STATUS_KEYS.has(key);
}

type TicketSlim = {
  id: string;
  statusId: string;
  createdAt: Date;
};

/**
 * For each ticket in `tickets`, compute the ISO timestamp it entered its
 * current `statusId`, using the latest `STATUS_CHANGED` activity whose
 * `payload.toStatusId` matches. Falls back to `createdAt` when no matching
 * activity row exists (legacy or ticket created directly in current status).
 *
 * Only populates an entry for tickets whose `statusKeysById[statusId]` is in
 * the human-waiting set — others get `null` so the UI can ignore them.
 */
export async function hydrateWaitingSince(
  tickets: ReadonlyArray<TicketSlim>,
  statusKeysById: Record<string, string | undefined>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (tickets.length === 0) return out;

  const waitingIds: string[] = [];
  for (const t of tickets) {
    if (isHumanWaitingStatusKey(statusKeysById[t.statusId])) waitingIds.push(t.id);
    else out.set(t.id, null);
  }
  if (waitingIds.length === 0) return out;

  const activities = await prisma.ticketActivity.findMany({
    where: { ticketId: { in: waitingIds }, kind: "STATUS_CHANGED" },
    select: { ticketId: true, payload: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const ticketById = new Map(tickets.map((t) => [t.id, t] as const));
  const matchedByTicket = new Map<string, Date>();
  for (const a of activities) {
    if (matchedByTicket.has(a.ticketId)) continue;
    const t = ticketById.get(a.ticketId);
    if (!t) continue;
    const payload = a.payload as { toStatusId?: unknown } | null;
    if (payload && payload.toStatusId === t.statusId) {
      matchedByTicket.set(a.ticketId, a.createdAt);
    }
  }

  for (const id of waitingIds) {
    const t = ticketById.get(id);
    if (!t) continue;
    const entered = matchedByTicket.get(id) ?? t.createdAt;
    out.set(id, entered.toISOString());
  }

  return out;
}

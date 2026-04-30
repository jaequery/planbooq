import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { archiveTicketSvc } from "@/server/services/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const r = await archiveTicketSvc(caller.userId, ticketId);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

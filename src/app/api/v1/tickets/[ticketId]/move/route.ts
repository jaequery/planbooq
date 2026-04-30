import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { moveTicketSvc } from "@/server/services/tickets";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await moveTicketSvc(caller.userId, ticketId, body);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

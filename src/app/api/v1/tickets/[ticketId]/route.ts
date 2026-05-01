import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { deleteTicketSvc, getTicketSvc, updateTicketSvc } from "@/server/services/tickets";
import { withIdentifier } from "../../_lib/decorate-ticket";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const r = await getTicketSvc(caller.userId, ticketId);
  return r.ok ? jsonOk(withIdentifier(r.data)) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await updateTicketSvc(caller.userId, ticketId, body);
  return r.ok ? jsonOk(withIdentifier(r.data)) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const r = await deleteTicketSvc(caller.userId, ticketId);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

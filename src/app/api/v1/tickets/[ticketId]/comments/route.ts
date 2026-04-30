import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { createCommentSvc, listTicketCommentsSvc } from "@/server/services/comments";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const url = new URL(req.url);
  const r = await listTicketCommentsSvc(caller.userId, ticketId, {
    cursor: url.searchParams.get("cursor"),
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonErr("validation_error", 400);
  const r = await createCommentSvc(caller.userId, { ...body, ticketId });
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

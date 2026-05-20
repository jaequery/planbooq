import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { getOrCreateConversationForTicket } from "@/server/services/conversations";
import { createMessageSvc, listMessagesSvc } from "@/server/services/messages";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const url = new URL(req.url);
  const conversation = await getOrCreateConversationForTicket(ticketId).catch(() => null);
  if (!conversation) return jsonErr("ticket_not_found", 404);
  const r = await listMessagesSvc(caller.userId, conversation.id, {
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
  const r = await createMessageSvc({ trust: "user_session", actorUserId: caller.userId }, {
    ...(body as Record<string, unknown>),
    ticketId,
    role: "USER",
  } as Parameters<typeof createMessageSvc>[1]);
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

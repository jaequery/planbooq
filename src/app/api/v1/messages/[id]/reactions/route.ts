import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { addReactionSvc, removeReactionSvc } from "@/server/services/reactions";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { emoji?: unknown } | null;
  if (!body || typeof body.emoji !== "string") return jsonErr("validation_error", 400);
  const r = await addReactionSvc(caller.userId, id, body.emoji);
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const emoji = url.searchParams.get("emoji");
  if (!emoji) return jsonErr("validation_error", 400);
  const r = await removeReactionSvc(caller.userId, id, emoji);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

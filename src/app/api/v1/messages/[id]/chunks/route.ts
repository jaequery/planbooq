import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { getMessageChunksSvc } from "@/server/services/messages";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const after = url.searchParams.get("after");
  const r = await getMessageChunksSvc(
    caller.userId,
    id,
    after !== null ? Number(after) : undefined,
  );
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

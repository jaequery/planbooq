import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { deleteProjectSvc, updateProjectSvc } from "@/server/services/projects";

type Ctx = { params: Promise<{ projectId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { projectId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await updateProjectSvc(caller.userId, projectId, body);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { projectId } = await ctx.params;
  const r = await deleteProjectSvc(caller.userId, projectId);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

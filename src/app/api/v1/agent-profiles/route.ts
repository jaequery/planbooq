import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { createAgentProfileSvc, listAgentProfilesSvc } from "@/server/services/agent-profiles";

export async function GET(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? caller.workspaceScope;
  if (!workspaceId) return jsonErr("validation_error", 400);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const r = await listAgentProfilesSvc(caller.userId, { workspaceId, includeInactive });
  return r.ok ? jsonOk({ items: r.data }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function POST(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const workspaceId = body.workspaceId ?? caller.workspaceScope;
  if (!workspaceId) return jsonErr("validation_error", 400);
  const r = await createAgentProfileSvc(caller.userId, { ...body, workspaceId });
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

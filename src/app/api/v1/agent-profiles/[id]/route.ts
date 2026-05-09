import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import {
  deleteAgentProfileSvc,
  getAgentProfileSvc,
  updateAgentProfileSvc,
} from "@/server/services/agent-profiles";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const r = await getAgentProfileSvc(caller.userId, { id });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await updateAgentProfileSvc(caller.userId, { ...body, id });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const url = new URL(req.url);
  const purge = url.searchParams.get("purge") === "true";
  const r = await deleteAgentProfileSvc(caller.userId, { id, purge });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

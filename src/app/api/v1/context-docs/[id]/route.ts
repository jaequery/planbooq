import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import {
  deleteContextDocSvc,
  getContextDocSvc,
  updateContextDocSvc,
} from "@/server/services/context-docs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const r = await getContextDocSvc(caller.userId, { id });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await updateContextDocSvc(caller.userId, { ...body, id });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const r = await deleteContextDocSvc(caller.userId, { id });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

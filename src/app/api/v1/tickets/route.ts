import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { createTicketSvc, listProjectTicketsSvc } from "@/server/services/tickets";

export async function GET(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return jsonErr("validation_error", 400);
  const r = await listProjectTicketsSvc(caller.userId, projectId, {
    statusId: url.searchParams.get("statusId") ?? undefined,
    assigneeId: url.searchParams.get("assigneeId") ?? undefined,
    includeArchived: url.searchParams.get("includeArchived") === "true",
    cursor: url.searchParams.get("cursor"),
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function POST(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await createTicketSvc(caller.userId, body);
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

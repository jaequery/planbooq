import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import {
  listTicketAgentProfilesSvc,
  setTicketAgentProfilesSvc,
} from "@/server/services/agent-profiles";

export async function GET(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await params;
  const r = await listTicketAgentProfilesSvc(caller.userId, ticketId);
  return r.ok ? jsonOk({ items: r.data }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function PUT(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.agentProfileIds)) return jsonErr("validation_error", 400);
  const r = await setTicketAgentProfilesSvc(caller.userId, {
    ticketId,
    agentProfileIds: body.agentProfileIds,
  });
  return r.ok ? jsonOk({ items: r.data }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

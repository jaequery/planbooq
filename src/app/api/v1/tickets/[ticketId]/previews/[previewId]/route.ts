import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { removeTicketPreviewSvc } from "@/server/services/ticket-preview";

type Ctx = { params: Promise<{ ticketId: string; previewId: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId, previewId } = await ctx.params;
  const r = await removeTicketPreviewSvc({ caller, ticketId, previewId });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

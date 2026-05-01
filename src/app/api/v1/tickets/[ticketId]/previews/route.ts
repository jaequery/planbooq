import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { ATTACHMENT_LIMITS, getMaxSizeForMime } from "@/server/services/attachment";
import { addTicketPreviewSvc, listTicketPreviewsSvc } from "@/server/services/ticket-preview";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const r = await listTicketPreviewsSvc({ caller, ticketId });
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > ATTACHMENT_LIMITS.maxVideoSizeBytes + 64 * 1024) {
    return jsonErr("file_too_large", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr("invalid_form_data", 400);
  }

  const file = form.get("file");
  const labelRaw = form.get("label");

  if (!(file instanceof File)) return jsonErr("missing_file", 400);
  const cap = getMaxSizeForMime(file.type);
  if (cap === null) return jsonErr("unsupported_mime_type", 400);
  if (file.size <= 0 || file.size > cap) return jsonErr("file_too_large", 400);

  const label =
    typeof labelRaw === "string" && labelRaw.trim().length > 0
      ? labelRaw.trim().slice(0, 200)
      : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await addTicketPreviewSvc({
    caller,
    ticketId,
    file: { mimeType: file.type, size: buffer.byteLength, data: buffer },
    label,
  });
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

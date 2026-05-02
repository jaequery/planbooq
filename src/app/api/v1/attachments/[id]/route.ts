import { jsonErr, requireCaller } from "@/server/api-auth";
import { getAttachmentForCaller } from "@/server/services/attachment";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

  const { id } = await ctx.params;
  const attachment = await getAttachmentForCaller(
    { userId: caller.userId, workspaceScope: caller.workspaceScope },
    id,
  );
  if (!attachment) return jsonErr("not_found", 404);

  return new Response(attachment.body, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

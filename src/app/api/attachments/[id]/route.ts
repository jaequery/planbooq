import { NextResponse } from "next/server";
import { requireCaller } from "@/server/api-auth";
import { auth } from "@/server/auth";
import { getAttachment, getAttachmentForCaller } from "@/server/services/attachment";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // Two auth paths: browser session (cookie) for in-app `<img>` loads, and
  // planbooq API bearer token for non-browser consumers (paired agents, CI,
  // anyone holding a `pbq_live_…` key). The desktop agent's Claude subprocess
  // historically failed here because curl from outside the session got 401
  // and silently saved the JSON error body as a "PNG" — poisoning the
  // conversation with an unprocessable image. Accept the bearer too.
  const session = await auth();
  if (session?.user?.id) {
    const attachment = await getAttachment(session.user.id, id);
    if (!attachment) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return new NextResponse(attachment.body, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.size),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  }

  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const attachment = await getAttachmentForCaller(
    { userId: caller.userId, workspaceScope: caller.workspaceScope },
    id,
  );
  if (!attachment) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return new NextResponse(attachment.body, {
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

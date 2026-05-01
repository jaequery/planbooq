import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getAttachment } from "@/server/services/attachment";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await getAttachment(session.user.id, id);
  if (!attachment) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

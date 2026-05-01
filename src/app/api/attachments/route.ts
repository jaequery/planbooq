import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import {
  ATTACHMENT_LIMITS,
  createAttachment,
  getMaxSizeForMime,
} from "@/server/services/attachment";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Pre-check uses the largest allowed cap (video); per-mime cap enforced in service layer.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > ATTACHMENT_LIMITS.maxVideoSizeBytes + 64 * 1024) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form_data" }, { status: 400 });
  }

  const file = form.get("file");
  const workspaceId = form.get("workspaceId");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_workspaceId" }, { status: 400 });
  }
  const cap = getMaxSizeForMime(file.type);
  if (cap === null) {
    return NextResponse.json({ ok: false, error: "unsupported_mime_type" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > cap) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createAttachment({
      userId: session.user.id,
      workspaceId,
      mimeType: file.type,
      size: buffer.byteLength,
      data: buffer,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (
      message === "forbidden" ||
      message === "unsupported_mime_type" ||
      message === "file_too_large" ||
      message === "size_mismatch"
    ) {
      const status = message === "forbidden" ? 403 : 400;
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    logger.error("attachments.upload.failed", { error: message });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export type AuthedCaller = {
  userId: string;
  /** When set, the caller's API key restricts them to this workspace. */
  workspaceScope: string | null;
  via: "api_key" | "session";
};

const BEARER_RE = /^Bearer\s+(.+)$/i;

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function resolveCaller(req: Request): Promise<AuthedCaller | null> {
  const header = req.headers.get("authorization");
  const match = header ? BEARER_RE.exec(header) : null;
  if (match?.[1]) {
    const token = match[1].trim();
    const prefix = token.slice(0, 16);
    const candidates = await prisma.apiKey.findMany({
      where: { prefix, revokedAt: null },
    });
    const expected = hashApiKey(token);
    const key = candidates.find((k) => safeEqualHex(k.hash, expected));
    if (!key) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;
    void prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return { userId: key.userId, workspaceScope: key.workspaceId, via: "api_key" };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, workspaceScope: null, via: "session" };
  }
  return null;
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonErr(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function requireCaller(req: Request): Promise<AuthedCaller | NextResponse> {
  const caller = await resolveCaller(req);
  if (!caller) return jsonErr("unauthorized", 401);
  return caller;
}

export async function assertWorkspaceAccess(
  caller: AuthedCaller,
  workspaceId: string,
): Promise<NextResponse | null> {
  if (caller.workspaceScope && caller.workspaceScope !== workspaceId) {
    return jsonErr("forbidden", 403);
  }
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: caller.userId } },
  });
  if (!member) return jsonErr("forbidden", 403);
  return null;
}

export function mapErrorToStatus(code: string): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "ticket_not_found":
    case "invalid_project":
    case "invalid_status":
    case "comment_not_found":
    case "preview_not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "duplicate_title":
      return 409;
    case "validation_error":
    case "invalid_assignee":
    case "invalid_label":
    case "invalid_anchor_before":
    case "invalid_anchor_after":
    case "ticket_archived":
    case "label_name_taken":
    case "slug_taken":
    case "invalid_slug":
    case "invalid_color":
      return 400;
    default:
      return 500;
  }
}

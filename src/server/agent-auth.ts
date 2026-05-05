import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

const BEARER_RE = /^Bearer\s+(.+)$/i;
const TOKEN_PREFIX_LEN = 16;

export type AuthedAgent = {
  id: string;
  workspaceId: string;
  userId: string;
};

export function generateAgentToken(): { plaintext: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const plaintext = `pba_live_${raw}`;
  const prefix = plaintext.slice(0, TOKEN_PREFIX_LEN);
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

export function generatePairCode(): string {
  // 8-char human-friendly code
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function resolveAgent(req: Request): Promise<AuthedAgent | null> {
  const header = req.headers.get("authorization");
  const match = header ? BEARER_RE.exec(header) : null;
  if (!match?.[1]) return null;
  const token = match[1].trim();
  if (!token.startsWith("pba_live_")) return null;
  const prefix = token.slice(0, TOKEN_PREFIX_LEN);
  const agent = await prisma.agent.findUnique({ where: { tokenPrefix: prefix } });
  if (!agent || agent.revokedAt) return null;
  const expected = createHash("sha256").update(token).digest("hex");
  if (!safeEqualHex(agent.tokenHash, expected)) return null;
  void prisma.agent
    .update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});
  return { id: agent.id, workspaceId: agent.workspaceId, userId: agent.userId };
}

export async function requireAgent(req: Request): Promise<AuthedAgent | NextResponse> {
  const agent = await resolveAgent(req);
  if (!agent) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return agent;
}

import os from "node:os";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAgentToken } from "@/server/agent-auth";
import { prisma } from "@/server/db";

const BodySchema = z
  .object({
    code: z.string().min(1),
    workspaceId: z.string().min(1),
    name: z.string().min(1).max(64).optional(),
    hostname: z.string().max(255).optional(),
    platform: z.string().max(64).optional(),
  })
  .strict();

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  const { code, workspaceId } = parsed.data;

  const pair = await prisma.agentPairCode.findUnique({ where: { code } });
  if (!pair) return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 404 });
  if (pair.claimedAt)
    return NextResponse.json({ ok: false, error: "already_claimed" }, { status: 409 });
  if (pair.expiresAt < new Date())
    return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: pair.userId } },
  });
  if (!member) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { plaintext, prefix, hash } = generateAgentToken();
  const hostname = parsed.data.hostname ?? os.hostname();
  const name = parsed.data.name ?? hostname;
  const platform = parsed.data.platform ?? process.platform;

  const agent = await prisma.agent.create({
    data: {
      workspaceId,
      userId: pair.userId,
      name,
      tokenPrefix: prefix,
      tokenHash: hash,
      hostname,
      platform,
    },
    select: { id: true, workspaceId: true, name: true },
  });

  await prisma.agentPairCode.update({
    where: { id: pair.id },
    data: { claimedAt: new Date(), agentId: agent.id },
  });

  return NextResponse.json({
    ok: true,
    data: {
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      name: agent.name,
      token: plaintext,
    },
  });
}

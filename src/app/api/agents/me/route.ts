import { NextResponse } from "next/server";
import { requireAgent } from "@/server/agent-auth";
import { prisma } from "@/server/db";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAgent(req);
  if (auth instanceof NextResponse) return auth;
  const agent = await prisma.agent.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      name: true,
      hostname: true,
      platform: true,
    },
  });
  if (!agent) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: agent });
}

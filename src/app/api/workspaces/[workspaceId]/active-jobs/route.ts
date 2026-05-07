import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

// Returns currently-live (PENDING or RUNNING) agent jobs for tickets the
// caller can see in this workspace. Used by the Board on mount to seed the
// in-memory liveAgents map so we don't depend solely on Ably deltas — a
// missed terminal delta would otherwise leave a card stuck on "running".
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await ctx.params;
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const jobs = await prisma.agentJob.findMany({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      ticket: { workspaceId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ticketId: true,
      kind: true,
      status: true,
    },
  });

  return NextResponse.json({ ok: true, data: jobs });
}

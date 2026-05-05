import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: ticket.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const jobs = await prisma.agentJob.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      output: true,
      exitCode: true,
      error: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      agent: { select: { id: true, name: true, hostname: true } },
    },
  });
  return NextResponse.json({ ok: true, data: jobs });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StartSchema = z
  .object({
    prompt: z.string().min(1).max(20000),
    worktreePath: z.string().optional().nullable(),
    claudeSessionId: z.string().optional().nullable(),
    kind: z.enum(["CHAT", "EXECUTE"]).optional(),
  })
  .strict();

/**
 * GET /api/tickets/:id/desktop-jobs
 * Returns the most recent desktop job for the ticket (for hydrate on mount).
 */
export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind =
    kindParam === "PLAN" || kindParam === "EXECUTE" || kindParam === "CHAT" ? kindParam : "CHAT";

  // CHAT (default) returns the latest desktop session of either CHAT or
  // EXECUTE kind so the desktop chat panel hydrates whichever is current.
  // PLAN/EXECUTE explicit asks return that exact kind.
  const where =
    kind === "CHAT"
      ? {
          ticketId: id,
          source: "DESKTOP",
          userId: session.user.id,
          kind: { in: ["CHAT", "EXECUTE"] },
        }
      : { ticketId: id, userId: session.user.id, kind };

  const job = await prisma.agentJob.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      output: true,
      worktreePath: true,
      claudeSessionId: true,
      exitCode: true,
      createdAt: true,
      finishedAt: true,
      kind: true,
    },
  });
  return NextResponse.json({ ok: true, data: job });
}

/**
 * POST /api/tickets/:id/desktop-jobs
 * Creates a new desktop job for streaming. Returns its id.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = StartSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: ticket.workspaceId, userId } },
  });
  if (!member) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const job = await prisma.agentJob.create({
    data: {
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      userId,
      source: "DESKTOP",
      kind: parsed.data.kind ?? "CHAT",
      status: "RUNNING",
      prompt: parsed.data.prompt,
      worktreePath: parsed.data.worktreePath ?? null,
      claudeSessionId: parsed.data.claudeSessionId ?? null,
      startedAt: new Date(),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, data: { jobId: job.id } });
}

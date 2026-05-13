import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { workflowCommander } from "@/server/services/workflow-commander";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StartSchema = z
  .object({
    prompt: z.string().min(1).max(20000),
    worktreePath: z.string().optional().nullable(),
    claudeSessionId: z.string().optional().nullable(),
    kind: z.enum(["CHAT", "EXECUTE"]).optional(),
    /** When the caller is a workflow dispatch, this binds the new AgentJob
     *  to the WorkflowStepRun the panel reserved up front. Lets chat history
     *  link back to its step by FK instead of regex-matching the prompt
     *  prefix later. Server validates it belongs to a WorkflowRun for this
     *  ticket. */
    workflowStepRunId: z.string().optional().nullable(),
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

  // Validate the proposed workflowStepRunId before trusting it on the FK.
  // Anyone with workspace membership could otherwise stamp an arbitrary
  // step-run id onto a job and pollute another ticket's workflow history.
  let stepRunId: string | null = null;
  if (parsed.data.workflowStepRunId) {
    const sr = await prisma.workflowStepRun.findUnique({
      where: { id: parsed.data.workflowStepRunId },
      select: { id: true, status: true, run: { select: { ticketId: true } } },
    });
    if (sr && sr.run.ticketId === ticket.id) {
      stepRunId = sr.id;
    }
  }

  // Cold-resume recovery: caller dispatched a workflow-prefixed prompt but
  // forgot to thread the stepRunId (legacy renderer, race after refresh,
  // bridge replay after a crash). Match the prefix's step name against a
  // PENDING step on an active WorkflowRun for this ticket. Without this,
  // the agent runs the step but `persistTurnEnd`'s FK chain never resolves
  // and the step never closes — exactly the timeline bug we just fixed for
  // the activity rows, but on the data side.
  //
  // Strictly opt-in: requires the `[Workflow N/M: <name>]` prefix to be
  // present in the prompt the caller already chose to send. We do NOT
  // auto-prefix arbitrary user chat — that would silently absorb unrelated
  // follow-up messages into the next workflow step.
  if (!stepRunId) {
    const prefixMatch = parsed.data.prompt
      .slice(0, 200)
      .match(/^\[Workflow(?:\s+\d+\/\d+)?:\s*([^\]]+)\]/);
    const wantName = prefixMatch?.[1]?.trim() ?? null;
    if (wantName) {
      const candidate = await prisma.workflowStepRun
        .findFirst({
          where: {
            name: wantName,
            status: { in: ["PENDING", "RUNNING"] },
            run: { ticketId: ticket.id, status: "RUNNING" },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
        .catch(() => null);
      if (candidate) stepRunId = candidate.id;
    }
  }

  const startedAt = new Date();
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
      workflowStepRunId: stepRunId,
      startedAt,
    },
    select: { id: true },
  });

  if (stepRunId) {
    await workflowCommander.attachJobToStep({ stepRunId, jobId: job.id }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, data: { jobId: job.id } });
}

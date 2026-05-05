import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

const KindSchema = z.enum(["PR_CREATED", "COMMIT_PUSHED", "TEST_RUN", "BUILD", "NOTE"]);

const PostSchema = z
  .object({
    kind: KindSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAgent(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const job = await prisma.agentJob.findUnique({
    where: { id },
    select: { id: true, agentId: true, ticketId: true, ticket: { select: { workspaceId: true } } },
  });
  if (!job || job.agentId !== auth.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const activity = await prisma.ticketActivity.create({
    data: {
      ticketId: job.ticketId,
      workspaceId: job.ticket.workspaceId,
      jobId: job.id,
      kind: parsed.data.kind,
      payload: parsed.data.payload as Prisma.InputJsonValue,
    },
    select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
  });

  if (parsed.data.kind === "PR_CREATED" && typeof parsed.data.payload.url === "string") {
    await prisma.ticket.update({
      where: { id: job.ticketId },
      data: { prUrl: parsed.data.payload.url },
    });
  }

  await publishWorkspaceEvent(job.ticket.workspaceId, {
    name: "ticket.activity",
    workspaceId: job.ticket.workspaceId,
    ticketId: job.ticketId,
    activity: {
      id: activity.id,
      kind: activity.kind,
      payload: activity.payload as Record<string, unknown>,
      jobId: activity.jobId,
      createdAt: activity.createdAt.toISOString(),
    },
  });

  return NextResponse.json({ ok: true, data: { id: activity.id } });
}

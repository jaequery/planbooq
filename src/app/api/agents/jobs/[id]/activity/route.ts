import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { maybeLinkPrUrlFromText } from "@/server/services/link-pr-url";

const KindSchema = z.enum([
  "PR_CREATED",
  "COMMIT_PUSHED",
  "TEST_RUN",
  "BUILD",
  "NOTE",
  "STATUS_CHANGED",
  "STEP_STARTED",
  "STEP_COMPLETED",
]);

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

  // Any activity payload may contain a PR URL — not just PR_CREATED. Common
  // failure mode: hook fires COMMIT_PUSHED with the PR URL captured from
  // `git push` output, or NOTE with free-form text. Funnel everything through
  // the same linker so a PR mention anywhere lands on the ticket.
  await maybeLinkPrUrlFromText(job.ticketId, JSON.stringify(parsed.data.payload));

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

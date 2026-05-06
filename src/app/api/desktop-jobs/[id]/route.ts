import { NextResponse } from "next/server";
import { z } from "zod";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    appendOutput: z.string().optional(),
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]).optional(),
    exitCode: z.number().int().optional(),
    error: z.string().optional(),
    worktreePath: z.string().optional().nullable(),
    claudeSessionId: z.string().optional().nullable(),
  })
  .strict();

export async function PATCH(
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
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const job = await prisma.agentJob.findUnique({ where: { id } });
  if (!job || job.source !== "DESKTOP" || job.userId !== userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (
      parsed.data.status === "SUCCEEDED" ||
      parsed.data.status === "FAILED" ||
      parsed.data.status === "CANCELED"
    ) {
      data.finishedAt = new Date();
    }
  }
  if (typeof parsed.data.exitCode === "number") data.exitCode = parsed.data.exitCode;
  if (parsed.data.error) data.error = parsed.data.error;
  if (parsed.data.appendOutput) {
    data.output = `${job.output}${parsed.data.appendOutput}`;
  }
  if (parsed.data.worktreePath !== undefined) data.worktreePath = parsed.data.worktreePath;
  if (parsed.data.claudeSessionId !== undefined) {
    data.claudeSessionId = parsed.data.claudeSessionId;
  }

  await prisma.agentJob.update({ where: { id }, data, select: { id: true } });

  // Fanout for cross-tab/cross-client liveness.
  if (job.workspaceId && (parsed.data.appendOutput || parsed.data.status)) {
    void publishWorkspaceEvent(job.workspaceId, {
      name: "agent.delta",
      jobId: id,
      ticketId: job.ticketId,
      workspaceId: job.workspaceId,
      kind: (job.kind as "PLAN" | "EXECUTE" | "CHAT") ?? "CHAT",
      appendOutput: parsed.data.appendOutput,
      status: parsed.data.status,
    });
  }

  return NextResponse.json({ ok: true });
}

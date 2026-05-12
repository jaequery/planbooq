import type { AgentJob } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { prisma } from "@/server/db";
import { mirrorAppendOutput, mirrorJobTerminal } from "@/server/services/mirror-agent-job";

const PatchSchema = z
  .object({
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]).optional(),
    appendOutput: z.string().optional(),
    exitCode: z.number().int().optional(),
    error: z.string().optional(),
  })
  .strict();

export async function PATCH(
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
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  // Skip the multi-MB `output` and `prompt` TEXT columns on the hot streaming
  // path. Reading them on every chunk PATCH caused quadratic IO — each append
  // re-read the entire (growing) output blob. Mirror functions don't read
  // `output`; on terminal we re-fetch it once for mirrorJobTerminal.
  const jobRow = await prisma.agentJob.findUnique({
    where: { id },
    select: {
      id: true,
      agentId: true,
      ticketId: true,
      workspaceId: true,
      userId: true,
      source: true,
      kind: true,
      status: true,
      exitCode: true,
      error: true,
      worktreePath: true,
      claudeSessionId: true,
      workflowStepRunId: true,
      outcome: true,
      outcomeReason: true,
      sourceJobId: true,
      continuationAttempt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!jobRow || jobRow.agentId !== auth.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const job: AgentJob = { ...jobRow, output: "", prompt: "" };

  // Append-only path: single roundtrip, no read of the existing blob.
  if (parsed.data.appendOutput) {
    await prisma.$executeRaw`
      UPDATE "AgentJob"
         SET "output" = "output" || ${parsed.data.appendOutput},
             "updatedAt" = NOW()
       WHERE id = ${id}
    `;
  }

  const statusData: Record<string, unknown> = {};
  if (parsed.data.status) {
    statusData.status = parsed.data.status;
    if (parsed.data.status === "RUNNING" && !job.startedAt) statusData.startedAt = new Date();
    if (
      parsed.data.status === "SUCCEEDED" ||
      parsed.data.status === "FAILED" ||
      parsed.data.status === "CANCELED"
    ) {
      statusData.finishedAt = new Date();
    }
  }
  if (typeof parsed.data.exitCode === "number") statusData.exitCode = parsed.data.exitCode;
  if (parsed.data.error) statusData.error = parsed.data.error;

  const updated =
    Object.keys(statusData).length > 0
      ? await prisma.agentJob.update({
          where: { id },
          data: statusData,
          select: { id: true, status: true, ticketId: true },
        })
      : { id: job.id, status: job.status, ticketId: job.ticketId };

  if (parsed.data.appendOutput) {
    void mirrorAppendOutput({ job, appendOutput: parsed.data.appendOutput });
  }
  if (
    parsed.data.status === "SUCCEEDED" ||
    parsed.data.status === "FAILED" ||
    parsed.data.status === "CANCELED"
  ) {
    // Re-fetch the now-final blob once on terminal. Skipped on the hot path,
    // so this is the only place full output gets pulled across.
    void prisma.agentJob
      .findUnique({ where: { id }, select: { output: true } })
      .then((row) => {
        void mirrorJobTerminal({
          job,
          status: parsed.data.status as "SUCCEEDED" | "FAILED" | "CANCELED",
          finalOutput: row?.output ?? "",
        });
      })
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true, data: updated });
}

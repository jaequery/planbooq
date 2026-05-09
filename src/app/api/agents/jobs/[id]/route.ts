import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { prisma } from "@/server/db";

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

  const job = await prisma.agentJob.findUnique({ where: { id } });
  if (!job || job.agentId !== auth.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === "RUNNING" && !job.startedAt) data.startedAt = new Date();
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

  // Atomic append in SQL — read-modify-write of job.output races with
  // concurrent PATCHes (paired-agent stdout chunks arrive in parallel) and
  // last-write-wins drops chunks, so the rendered chat appears empty/partial.
  if (parsed.data.appendOutput) {
    await prisma.$executeRaw`UPDATE "AgentJob" SET "output" = "output" || ${parsed.data.appendOutput} WHERE "id" = ${id}`;
  }

  const updated = await prisma.agentJob.update({
    where: { id },
    data,
    select: { id: true, status: true, ticketId: true },
  });

  return NextResponse.json({ ok: true, data: updated });
}

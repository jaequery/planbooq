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
  if (parsed.data.appendOutput) {
    data.output = `${job.output}${parsed.data.appendOutput}`;
  }

  const updated = await prisma.agentJob.update({
    where: { id },
    data,
    select: { id: true, status: true, ticketId: true },
  });

  // Light-touch fanout: publish a workspace event so the ticket UI can subscribe
  // to live output without long-polling. Kept inline-cheap to avoid extra deps.
  // (Workspace channel; ticket UI already has membership-scoped token.)
  return NextResponse.json({ ok: true, data: updated });
}

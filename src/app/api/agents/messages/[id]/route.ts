import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { finalizeMessageSvc } from "@/server/services/messages";

const PatchSchema = z
  .object({
    status: z.enum(["COMPLETE", "ERROR"]),
    body: z.string().max(50_000).optional(),
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
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

  const result = await finalizeMessageSvc({
    messageId: id,
    agentId: auth.id,
    status: parsed.data.status,
    body: parsed.data.body,
  });
  if (!result.ok) {
    const status =
      result.error === "message_not_found"
        ? 404
        : result.error === "agent_mismatch"
          ? 403
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

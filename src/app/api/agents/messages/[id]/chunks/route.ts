import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { appendMessageChunkSvc } from "@/server/services/messages";

const PostSchema = z
  .object({
    chunks: z
      .array(
        z
          .object({
            sequence: z.number().int().min(0),
            delta: z.string().max(16_000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
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
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

  const result = await appendMessageChunkSvc({
    messageId: id,
    agentId: auth.id,
    chunks: parsed.data.chunks,
  });
  if (!result.ok) {
    const status =
      result.error === "message_not_found" ? 404 : result.error === "agent_mismatch" ? 403 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

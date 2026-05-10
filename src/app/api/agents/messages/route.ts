import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/server/agent-auth";
import { createMessageSvc } from "@/server/services/messages";

// Agent-runtime-only endpoint for posting AGENT-role messages into a ticket
// conversation. Uses Bearer pba_live_… auth (see resolveAgent). The resolved
// agent ID is the source of truth — request bodies that try to set
// authorAgentId are ignored. User sessions and pbq_live_ workspace API tokens
// cannot reach this endpoint because requireAgent only accepts pba_live_.
const PostSchema = z
  .object({
    ticketId: z.string().min(1),
    body: z.string().min(1).max(50_000),
    agentJobId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict();

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAgent(req);
  if (auth instanceof NextResponse) return auth;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createMessageSvc(
    { trust: "internal_agent", actorUserId: null },
    {
      ticketId: parsed.data.ticketId,
      body: parsed.data.body,
      role: "AGENT",
      authorAgentId: auth.id,
      agentJobId: parsed.data.agentJobId ?? null,
      parentId: parsed.data.parentId ?? null,
      idempotencyKey: parsed.data.idempotencyKey,
    },
  );

  if (!result.ok) {
    const status =
      result.error === "ticket_not_found"
        ? 404
        : result.error === "agent_workspace_mismatch"
          ? 403
          : result.error === "ticket_archived"
            ? 409
            : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result, { status: 201 });
}

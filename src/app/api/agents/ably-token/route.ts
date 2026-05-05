import { NextResponse } from "next/server";
import { createAgentTokenRequest } from "@/server/ably";
import { requireAgent } from "@/server/agent-auth";

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAgent(req);
  if (auth instanceof NextResponse) return auth;
  const tr = await createAgentTokenRequest(auth.id);
  if (!tr) return NextResponse.json({ ok: false, error: "ably_not_configured" }, { status: 503 });
  return NextResponse.json(tr);
}

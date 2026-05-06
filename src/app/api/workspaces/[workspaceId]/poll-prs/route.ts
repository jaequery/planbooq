import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { pollMergedPrsForWorkspace } from "@/server/services/poll-prs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await ctx.params;
  const result = await pollMergedPrsForWorkspace({
    userId: session.user.id,
    workspaceId,
  });
  return NextResponse.json({ ok: true, data: result });
}

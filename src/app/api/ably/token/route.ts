import { NextResponse } from "next/server";
import { z } from "zod";
import { createTokenRequest } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

const BodySchema = z.object({
  workspaceId: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "missing_workspaceId" }, { status: 400 });
  }

  const { workspaceId } = parsed.data;

  const member = await prisma.member.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: session.user.id,
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const tokenRequest = await createTokenRequest(workspaceId, session.user.id);
  if (!tokenRequest) {
    return NextResponse.json({ error: "ably_not_configured" }, { status: 503 });
  }

  return NextResponse.json(tokenRequest);
}

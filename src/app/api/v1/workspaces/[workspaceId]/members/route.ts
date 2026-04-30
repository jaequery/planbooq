import { assertWorkspaceAccess, jsonOk, requireCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;
  const denied = await assertWorkspaceAccess(caller, workspaceId);
  if (denied) return denied;
  const members = await prisma.member.findMany({
    where: { workspaceId },
    select: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
  return jsonOk(members);
}

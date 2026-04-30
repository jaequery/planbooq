import { assertWorkspaceAccess, jsonOk, requireCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;
  const denied = await assertWorkspaceAccess(caller, workspaceId);
  if (denied) return denied;
  const statuses = await prisma.status.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
  });
  return jsonOk(statuses);
}

import { jsonOk, requireCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";

export async function GET(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const where = caller.workspaceScope
    ? { id: caller.workspaceScope, members: { some: { userId: caller.userId } } }
    : { members: { some: { userId: caller.userId } } };
  const workspaces = await prisma.workspace.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  return jsonOk(workspaces);
}

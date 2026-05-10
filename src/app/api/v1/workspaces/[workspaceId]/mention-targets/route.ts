import { jsonErr, jsonOk, requireCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";

type Ctx = { params: Promise<{ workspaceId: string }> };

// Mention-target search: returns workspace members + non-revoked agents
// matching the query. Used by the composer's @-autocomplete (when there is
// one) and the agent-picker button. Caps at 10 of each type.
export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;

  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: caller.userId } },
  });
  if (!member) return jsonErr("forbidden", 403);

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const [members, agents] = await Promise.all([
    prisma.member.findMany({
      where: {
        workspaceId,
        ...(q
          ? {
              user: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      select: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      take: 10,
    }),
    prisma.agent.findMany({
      where: {
        workspaceId,
        revokedAt: null,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      select: { id: true, name: true, lastSeenAt: true },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);

  return jsonOk({
    users: members.map((m) => ({
      type: "USER" as const,
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    })),
    agents: agents.map((a) => ({
      type: "AGENT" as const,
      id: a.id,
      name: a.name,
      lastSeenAt: a.lastSeenAt,
    })),
  });
}

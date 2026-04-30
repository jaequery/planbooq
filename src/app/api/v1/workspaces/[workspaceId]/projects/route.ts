import {
  assertWorkspaceAccess,
  jsonErr,
  jsonOk,
  mapErrorToStatus,
  requireCaller,
} from "@/server/api-auth";
import { prisma } from "@/server/db";
import { createProjectSvc } from "@/server/services/projects";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;
  const denied = await assertWorkspaceAccess(caller, workspaceId);
  if (denied) return denied;
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
  });
  return jsonOk(projects);
}

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;
  const denied = await assertWorkspaceAccess(caller, workspaceId);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonErr("validation_error", 400);
  const r = await createProjectSvc(caller.userId, { ...body, workspaceId });
  return r.ok ? jsonOk(r.data, { status: 201 }) : jsonErr(r.error, mapErrorToStatus(r.error));
}

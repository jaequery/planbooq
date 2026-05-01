"use server";

import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export async function getCurrentWorkspaceId(): Promise<
  ServerActionResult<{ workspaceId: string }>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { ok: false, error: "no_workspace" };
  return { ok: true, data: { workspaceId: membership.workspaceId } };
}

export async function getProjectIdBySlug(
  slug: string,
): Promise<ServerActionResult<{ projectId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!membership) return { ok: false, error: "no_workspace" };
  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId: membership.workspaceId, slug } },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "not_found" };
  return { ok: true, data: { projectId: project.id } };
}

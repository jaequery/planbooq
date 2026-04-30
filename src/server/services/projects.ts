import type { Project } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function requireMembership(workspaceId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

function safeInngest(name: string, data: Record<string, unknown>) {
  void inngest.send({ name, data }).catch((error: unknown) => {
    logger.warn("inngest.send.failed", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

// ---------------- Create ----------------

export const CreateProjectSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z.string().min(1).max(80),
    slug: z.string().min(1).max(60).regex(SLUG_RE, "invalid_slug").optional(),
    color: z.string().regex(HEX_COLOR_RE, "invalid_color"),
    description: z.string().max(2000).optional(),
    repoUrl: z.string().url().max(500).optional(),
    techStack: z.string().max(4000).optional(),
  })
  .strict();

export async function createProjectSvc(
  userId: string,
  input: z.infer<typeof CreateProjectSchema>,
): Promise<ServerActionResult<Project>> {
  try {
    const data = CreateProjectSchema.parse(input);
    await requireMembership(data.workspaceId, userId);

    const desiredSlug = data.slug ?? slugify(data.name);
    if (!desiredSlug || !SLUG_RE.test(desiredSlug)) {
      return { ok: false, error: "invalid_slug" };
    }

    const slugTaken = await prisma.project.findUnique({
      where: { workspaceId_slug: { workspaceId: data.workspaceId, slug: desiredSlug } },
      select: { id: true },
    });
    if (slugTaken) return { ok: false, error: "slug_taken" };

    const last = await prisma.project.findFirst({
      where: { workspaceId: data.workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1;

    const project = await prisma.project.create({
      data: {
        workspaceId: data.workspaceId,
        slug: desiredSlug,
        name: data.name,
        color: data.color,
        description: data.description,
        repoUrl: data.repoUrl,
        techStack: data.techStack,
        position,
      },
    });

    await publishWorkspaceEvent(data.workspaceId, {
      name: "project.created",
      workspaceId: data.workspaceId,
      project,
      by: userId,
    });
    safeInngest("project/created", { projectId: project.id, workspaceId: data.workspaceId });
    return { ok: true, data: project };
  } catch (error) {
    logger.error("createProjectSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// ---------------- Update ----------------

export const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    slug: z.string().min(1).max(60).regex(SLUG_RE, "invalid_slug").optional(),
    color: z.string().regex(HEX_COLOR_RE, "invalid_color").optional(),
    description: z.string().max(2000).nullable().optional(),
    repoUrl: z.string().url().max(500).nullable().optional(),
    techStack: z.string().max(4000).nullable().optional(),
  })
  .strict();

export async function updateProjectSvc(
  userId: string,
  projectId: string,
  input: z.infer<typeof UpdateProjectSchema>,
): Promise<ServerActionResult<Project>> {
  try {
    const data = UpdateProjectSchema.parse(input);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return { ok: false, error: "invalid_project" };
    await requireMembership(project.workspaceId, userId);

    if (data.slug && data.slug !== project.slug) {
      const taken = await prisma.project.findUnique({
        where: { workspaceId_slug: { workspaceId: project.workspaceId, slug: data.slug } },
        select: { id: true },
      });
      if (taken) return { ok: false, error: "slug_taken" };
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.repoUrl !== undefined ? { repoUrl: data.repoUrl } : {}),
        ...(data.techStack !== undefined ? { techStack: data.techStack } : {}),
      },
    });

    await publishWorkspaceEvent(project.workspaceId, {
      name: "project.updated",
      workspaceId: project.workspaceId,
      project: updated,
      by: userId,
    });
    return { ok: true, data: updated };
  } catch (error) {
    logger.error("updateProjectSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// ---------------- Delete ----------------

export async function deleteProjectSvc(
  userId: string,
  projectId: string,
): Promise<ServerActionResult<{ id: string; workspaceId: string }>> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return { ok: false, error: "invalid_project" };
    await requireMembership(project.workspaceId, userId);

    await prisma.project.delete({ where: { id: projectId } });

    await publishWorkspaceEvent(project.workspaceId, {
      name: "project.deleted",
      workspaceId: project.workspaceId,
      projectId: project.id,
      by: userId,
    });
    return { ok: true, data: { id: project.id, workspaceId: project.workspaceId } };
  } catch (error) {
    logger.error("deleteProjectSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

"use server";

import type { Project } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("unauthorized");
  }
  return session.user.id;
}

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

const CreateProjectSchema = z
  .object({
    name: z.string().min(1).max(80),
    slug: z.string().min(1).max(60).regex(SLUG_RE, "invalid_slug").optional(),
    color: z.string().regex(HEX_COLOR_RE, "invalid_color"),
    description: z.string().max(2000).optional(),
    repoUrl: z.string().url().max(500).optional(),
    techStack: z.string().max(4000).optional(),
  })
  .strict();

type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

type CreateProjectResult = { ok: true; project: Project } | { ok: false; error: string };

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  try {
    const data = CreateProjectSchema.parse(input);
    const userId = await requireUserId();

    const membership = await prisma.member.findFirst({
      where: { userId },
      select: { workspaceId: true },
    });
    if (!membership) {
      return { ok: false, error: "no_workspace" };
    }
    const workspaceId = membership.workspaceId;

    const desiredSlug = data.slug ?? slugify(data.name);
    if (!desiredSlug || !SLUG_RE.test(desiredSlug)) {
      return { ok: false, error: "invalid_slug" };
    }

    const slugTaken = await prisma.project.findUnique({
      where: { workspaceId_slug: { workspaceId, slug: desiredSlug } },
      select: { id: true },
    });
    if (slugTaken) {
      return { ok: false, error: "slug_taken" };
    }

    const last = await prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1;

    const project = await prisma.project.create({
      data: {
        workspaceId,
        slug: desiredSlug,
        name: data.name,
        color: data.color,
        description: data.description,
        repoUrl: data.repoUrl,
        techStack: data.techStack,
        position,
      },
    });

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { slug: true },
    });
    if (workspace) {
      revalidatePath(`/p/${project.slug}`);
    }

    await publishWorkspaceEvent(workspaceId, {
      name: "project.created",
      workspaceId,
      project,
      by: userId,
    });

    void inngest
      .send({
        name: "project/created",
        data: { projectId: project.id, workspaceId },
      })
      .catch((error: unknown) => {
        logger.warn("inngest.send.failed", {
          name: "project/created",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return { ok: true, project };
  } catch (error) {
    logger.error("createProject.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const UpdateProjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
  })
  .strict();

type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

type UpdateProjectResult = { ok: true; project: Project } | { ok: false; error: string };

export async function updateProject(input: UpdateProjectInput): Promise<UpdateProjectResult> {
  try {
    const data = UpdateProjectSchema.parse(input);
    const userId = await requireUserId();

    const project = await prisma.project.findUnique({
      where: { id: data.id },
      select: { id: true, workspaceId: true, slug: true },
    });
    if (!project) {
      return { ok: false, error: "not_found" };
    }

    const member = await prisma.member.findFirst({
      where: { userId, workspaceId: project.workspaceId },
      select: { id: true },
    });
    if (!member) {
      return { ok: false, error: "forbidden" };
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { name: data.name },
    });

    revalidatePath(`/p/${updated.slug}`);
    revalidatePath("/");

    await publishWorkspaceEvent(project.workspaceId, {
      name: "project.updated",
      workspaceId: project.workspaceId,
      project: updated,
      by: userId,
    });

    return { ok: true, project: updated };
  } catch (error) {
    logger.error("updateProject.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

const DeleteProjectSchema = z.object({ id: z.string().min(1) }).strict();

type DeleteProjectInput = z.infer<typeof DeleteProjectSchema>;

type DeleteProjectResult = { ok: true } | { ok: false; error: string };

export async function deleteProject(input: DeleteProjectInput): Promise<DeleteProjectResult> {
  try {
    const data = DeleteProjectSchema.parse(input);
    const userId = await requireUserId();

    const project = await prisma.project.findUnique({
      where: { id: data.id },
      select: { id: true, workspaceId: true, slug: true },
    });
    if (!project) {
      return { ok: false, error: "not_found" };
    }

    const member = await prisma.member.findFirst({
      where: { userId, workspaceId: project.workspaceId },
      select: { id: true },
    });
    if (!member) {
      return { ok: false, error: "forbidden" };
    }

    await prisma.project.delete({ where: { id: project.id } });

    revalidatePath(`/p/${project.slug}`);
    revalidatePath("/");

    await publishWorkspaceEvent(project.workspaceId, {
      name: "project.deleted",
      workspaceId: project.workspaceId,
      projectId: project.id,
      slug: project.slug,
      by: userId,
    });

    return { ok: true };
  } catch (error) {
    logger.error("deleteProject.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

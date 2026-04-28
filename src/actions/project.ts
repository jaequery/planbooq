"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { Project } from "@/lib/types";
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

export const CreateProjectSchema = z
  .object({
    name: z.string().min(1).max(80),
    slug: z.string().min(1).max(60).regex(SLUG_RE, "invalid_slug").optional(),
    color: z.string().regex(HEX_COLOR_RE, "invalid_color"),
    description: z.string().max(2000).optional(),
    repoUrl: z.string().url().max(500).optional(),
    techStack: z.string().max(4000).optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export type CreateProjectResult = { ok: true; project: Project } | { ok: false; error: string };

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

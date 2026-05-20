"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_SHORTCUTS,
  JUMP_SLOT_COUNT,
  type ProjectShortcuts,
  type SidebarSectionName,
} from "@/lib/shortcuts/defaults";
import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

const SIDEBAR_SECTION_NAMES = [
  "PROJECTS",
  "AGENTS",
  "SKILLS",
] as const satisfies readonly SidebarSectionName[];

const SidebarSectionInputSchema = z
  .object({
    name: z.enum(SIDEBAR_SECTION_NAMES),
    expanded: z.boolean(),
  })
  .strict();

const ShortcutsSchema = z
  .object({
    jumpToProject: z.array(z.string().min(1).max(16)).length(JUMP_SLOT_COUNT),
    prevProject: z.string().min(1).max(16),
    nextProject: z.string().min(1).max(16),
  })
  .strict();

function detectDuplicateChord(s: ProjectShortcuts): string | null {
  const all = [...s.jumpToProject, s.prevProject, s.nextProject];
  const seen = new Set<string>();
  for (const k of all) {
    const norm = k.toLowerCase();
    if (seen.has(norm)) return k;
    seen.add(norm);
  }
  return null;
}

export async function updateShortcuts(
  input: ProjectShortcuts,
): Promise<ServerActionResult<ProjectShortcuts>> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: "unauthorized" };

    const parsed = ShortcutsSchema.parse(input);
    const dup = detectDuplicateChord(parsed);
    if (dup) return { ok: false, error: `Duplicate shortcut: ${dup}` };

    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });
    const prevPrefs =
      existing?.preferences && typeof existing.preferences === "object"
        ? (existing.preferences as Record<string, unknown>)
        : {};
    const nextPrefs = { ...prevPrefs, shortcuts: parsed };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: nextPrefs },
    });

    revalidatePath("/", "layout");
    return { ok: true, data: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}

export async function resetShortcuts(): Promise<ServerActionResult<ProjectShortcuts>> {
  return updateShortcuts(DEFAULT_SHORTCUTS);
}

export async function updateSidebarSectionState(
  input: z.infer<typeof SidebarSectionInputSchema>,
): Promise<ServerActionResult<{ name: SidebarSectionName; expanded: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: "unauthorized" };

    const parsed = SidebarSectionInputSchema.parse(input);

    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });
    const prevPrefs =
      existing?.preferences && typeof existing.preferences === "object"
        ? (existing.preferences as Record<string, unknown>)
        : {};
    const prevSections =
      prevPrefs.sidebarSectionState && typeof prevPrefs.sidebarSectionState === "object"
        ? (prevPrefs.sidebarSectionState as Record<string, { expanded?: boolean }>)
        : {};
    const nextSections = {
      ...prevSections,
      [parsed.name]: { expanded: parsed.expanded },
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: { ...prevPrefs, sidebarSectionState: nextSections } },
    });

    return { ok: true, data: { name: parsed.name, expanded: parsed.expanded } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}

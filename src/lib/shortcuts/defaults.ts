export type ProjectShortcuts = {
  jumpToProject: string[];
  prevProject: string;
  nextProject: string;
};

export const JUMP_SLOT_COUNT = 9;

export const DEFAULT_SHORTCUTS: ProjectShortcuts = {
  jumpToProject: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  prevProject: "[",
  nextProject: "]",
};

export function normalizeShortcuts(input: unknown): ProjectShortcuts {
  const fallback = DEFAULT_SHORTCUTS;
  if (!input || typeof input !== "object") return fallback;
  const raw = input as Partial<ProjectShortcuts>;
  const jump = Array.isArray(raw.jumpToProject) ? raw.jumpToProject.slice(0, JUMP_SLOT_COUNT) : [];
  const jumpToProject: string[] = Array.from({ length: JUMP_SLOT_COUNT }, (_, i) => {
    const v = jump[i];
    if (typeof v === "string" && v.length > 0) return v;
    return fallback.jumpToProject[i] ?? String(i + 1);
  });
  return {
    jumpToProject,
    prevProject:
      typeof raw.prevProject === "string" && raw.prevProject.length > 0
        ? raw.prevProject
        : fallback.prevProject,
    nextProject:
      typeof raw.nextProject === "string" && raw.nextProject.length > 0
        ? raw.nextProject
        : fallback.nextProject,
  };
}

export function extractShortcuts(preferences: unknown): ProjectShortcuts {
  if (!preferences || typeof preferences !== "object") return DEFAULT_SHORTCUTS;
  const prefs = preferences as { shortcuts?: unknown };
  return normalizeShortcuts(prefs.shortcuts);
}

/** Render a chord for display, e.g. "1" -> "⌘1". */
export function formatChord(key: string): string {
  return `⌘${key.length === 1 ? key.toUpperCase() : key}`;
}

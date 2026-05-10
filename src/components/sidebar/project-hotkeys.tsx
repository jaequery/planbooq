"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useShortcuts } from "@/lib/shortcuts/provider";
import type { ProjectSummary } from "@/lib/types";

type Props = {
  projects: ReadonlyArray<ProjectSummary>;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function ProjectHotkeys({ projects }: Props): null {
  const router = useRouter();
  const pathname = usePathname();
  const shortcuts = useShortcuts();

  // Keep current values addressable from a stable listener.
  const stateRef = useRef({ projects, pathname, shortcuts });
  stateRef.current = { projects, pathname, shortcuts };

  useEffect(() => {
    function handle(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const { projects, pathname, shortcuts } = stateRef.current;
      if (projects.length === 0) return;

      const key = event.key;

      // Jump-to-N
      const jumpIdx = shortcuts.jumpToProject.indexOf(key);
      if (jumpIdx !== -1) {
        const target = projects[jumpIdx];
        if (target) {
          event.preventDefault();
          router.push(`/p/${target.slug}`);
        }
        return;
      }

      const matchPrev = key === shortcuts.prevProject;
      const matchNext = key === shortcuts.nextProject;
      if (!matchPrev && !matchNext) return;

      event.preventDefault();
      const currentSlug = pathname.match(/^\/p\/([^/]+)/)?.[1];
      const currentIdx = currentSlug ? projects.findIndex((p) => p.slug === currentSlug) : -1;
      const len = projects.length;
      let nextIdx: number;
      if (currentIdx === -1) {
        nextIdx = matchNext ? 0 : len - 1;
      } else {
        const delta = matchNext ? 1 : -1;
        nextIdx = (currentIdx + delta + len) % len;
      }
      const target = projects[nextIdx];
      if (target) router.push(`/p/${target.slug}`);
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [router]);

  return null;
}

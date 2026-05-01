"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getProjectIdBySlug } from "@/actions/ai-panel-helpers";

export type PageContext = {
  workspaceId: string | null;
  projectId: string | null;
  ticketId: string | null;
};

export function usePageContext(workspaceId: string | null): PageContext {
  const pathname = usePathname();
  const [projectId, setProjectId] = useState<string | null>(null);
  const slugCache = useRef<Map<string, string>>(new Map());

  // Parse slug + ticket from pathname.
  // Routes: /p/[slug] and (potentially) /p/[slug]/t/[ticketId]
  let slug: string | null = null;
  let ticketId: string | null = null;
  if (pathname) {
    const m = pathname.match(/^\/p\/([^/]+)(?:\/t\/([^/]+))?/);
    if (m) {
      slug = m[1] ?? null;
      ticketId = m[2] ?? null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setProjectId(null);
      return;
    }
    const cached = slugCache.current.get(slug);
    if (cached) {
      setProjectId(cached);
      return;
    }
    void getProjectIdBySlug(slug).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        slugCache.current.set(slug, res.data.projectId);
        setProjectId(res.data.projectId);
      } else {
        setProjectId(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { workspaceId, projectId, ticketId };
}

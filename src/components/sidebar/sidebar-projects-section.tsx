"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NewProjectDialog } from "@/components/sidebar/new-project-dialog";
import { ProjectActionsMenu } from "@/components/sidebar/project-actions-menu";
import { SidebarSection } from "@/components/sidebar/sidebar-section";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent, ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  projects: ReadonlyArray<ProjectSummary>;
  workspaceId: string;
  initialExpanded: boolean;
};

const COUNT_AFFECTING_EVENTS: ReadonlySet<AblyChannelEvent["name"]> = new Set([
  "ticket.created",
  "ticket.moved",
  "ticket.deleted",
  "ticket.archived",
  "ticket.unarchived",
]);

export function SidebarProjectsSection({
  projects,
  workspaceId,
  initialExpanded,
}: Props): React.ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (!COUNT_AFFECTING_EVENTS.has(event.name)) return;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, 150);
    },
    [router],
  );

  useBoardChannel(workspaceId, handleEvent);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  const handleProjectDeleted = (deletedSlug: string): void => {
    const viewing = pathname === `/p/${deletedSlug}` || pathname.startsWith(`/p/${deletedSlug}/`);
    if (!viewing) {
      router.refresh();
      return;
    }
    const idx = projects.findIndex((p) => p.slug === deletedSlug);
    if (idx === -1) {
      router.refresh();
      return;
    }
    const target = projects[idx + 1] ?? projects[idx - 1] ?? null;
    router.replace(target ? `/p/${target.slug}` : "/");
  };

  return (
    <SidebarSection
      name="PROJECTS"
      label="Projects"
      count={projects.length}
      initialExpanded={initialExpanded}
      action={
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-label="New project"
          title="New project"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
        </button>
      }
    >
      <ul className="flex flex-col gap-px px-2 pb-1">
        {projects.map((project) => {
          const href = `/p/${project.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={project.id} className="group/row relative">
              <Link
                href={href}
                className={cn(
                  "group flex h-8 items-center gap-2.5 rounded-md pr-8 pl-3 text-[13px] transition-colors duration-[120ms] ease-out",
                  active
                    ? "bg-foreground/[0.06] text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate">{project.name}</span>
                {(project.reviewCount ?? 0) > 0 ||
                (project.buildingCount ?? 0) > 0 ||
                (project.blockedCount ?? 0) > 0 ? (
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {(project.buildingCount ?? 0) > 0 ? (
                      <span
                        title={`${project.buildingCount} in progress`}
                        className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10.5px] font-medium tabular-nums text-amber-600 dark:text-amber-400"
                      >
                        {project.buildingCount}
                      </span>
                    ) : null}
                    {(project.blockedCount ?? 0) > 0 ? (
                      <span
                        title={`${project.blockedCount} blocked`}
                        className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500/15 px-1.5 text-[10.5px] font-medium tabular-nums text-red-600 dark:text-red-400"
                      >
                        {project.blockedCount}
                      </span>
                    ) : null}
                    {(project.reviewCount ?? 0) > 0 ? (
                      <span
                        title={`${project.reviewCount} awaiting review`}
                        className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-500/15 px-1.5 text-[10.5px] font-medium tabular-nums text-blue-600 dark:text-blue-400"
                      >
                        {project.reviewCount}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </Link>
              <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-[120ms] ease-out group-hover/row:opacity-100 [&:has([data-state=open])]:opacity-100">
                <ProjectActionsMenu
                  workspaceId={workspaceId}
                  projectId={project.id}
                  projectName={project.name}
                  projectDescription={project.description ?? null}
                  projectLocalPath={project.localPath ?? null}
                  onRenamed={() => router.refresh()}
                  onDeleted={() => handleProjectDeleted(project.slug)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SidebarSection>
  );
}

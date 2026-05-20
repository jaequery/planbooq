"use client";

import { ProjectHotkeys } from "@/components/sidebar/project-hotkeys";
import { SidebarProjectsSection } from "@/components/sidebar/sidebar-projects-section";
import { useSidebarState } from "@/components/sidebar/sidebar-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SidebarSectionState } from "@/lib/shortcuts/defaults";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  projects: ReadonlyArray<ProjectSummary>;
  workspaceId: string;
  sectionState: SidebarSectionState;
};

export function Sidebar({ projects, workspaceId, sectionState }: Props): React.ReactElement {
  const { collapsed } = useSidebarState();

  return (
    <aside
      aria-hidden={collapsed}
      inert={collapsed || undefined}
      className={cn(
        "flex shrink-0 flex-col overflow-hidden bg-muted/30 transition-[width,border-color] duration-300 ease-out",
        collapsed ? "w-0 border-r-0" : "w-60 border-r border-border/60",
      )}
    >
      <div className="flex min-h-0 w-60 flex-1 flex-col pt-12">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-1 py-2">
            <SidebarProjectsSection
              projects={projects}
              workspaceId={workspaceId}
              initialExpanded={sectionState.PROJECTS.expanded}
            />
          </div>
        </ScrollArea>
      </div>
      <ProjectHotkeys projects={projects} />
    </aside>
  );
}

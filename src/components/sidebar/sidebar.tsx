"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NewProjectDialog } from "@/components/sidebar/new-project-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  projects: ReadonlyArray<ProjectSummary>;
  workspaceLabel: string;
};

export function Sidebar({ projects, workspaceLabel }: Props): React.ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-muted/30">
      <div className="flex h-12 shrink-0 items-center border-b border-border/60 px-4">
        <span className="font-mono text-[13px] font-semibold tracking-tight text-foreground/90">
          {workspaceLabel}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Projects
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-px px-2 pb-2">
            {projects.map((project) => {
              const href = `/p/${project.slug}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={project.id}>
                  <Link
                    href={href}
                    className={cn(
                      "group flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors duration-[120ms] ease-out",
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
                  </Link>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <div className="border-t border-border/60 p-2">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-[13px] text-muted-foreground transition-colors duration-[120ms] ease-out hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New project
          </button>
        </div>
      </div>
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </aside>
  );
}

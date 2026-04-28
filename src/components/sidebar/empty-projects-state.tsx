"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { NewProjectDialog } from "@/components/sidebar/new-project-dialog";
import { Button } from "@/components/ui/button";

export function EmptyProjectsState(): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FolderPlus className="h-5 w-5 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">No projects yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Projects group tickets and give Claude Code context for your stack. Create your first to get
        started.
      </p>
      <Button className="mt-6" onClick={() => setOpen(true)}>
        Create your first project
      </Button>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

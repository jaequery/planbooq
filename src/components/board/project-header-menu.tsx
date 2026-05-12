"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { ChevronDown, Pencil, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { deleteProject, updateProject } from "@/actions/project";
import { ProjectSettingsDialog } from "@/components/sidebar/project-settings-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const RenameSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
});

type RenameValues = z.infer<typeof RenameSchema>;

type Props = {
  workspaceId: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  projectDescription?: string | null;
  projectLocalPath?: string | null;
};

export function ProjectHeaderMenu({
  workspaceId,
  projectId,
  projectName,
  projectColor,
  projectDescription,
  projectLocalPath,
}: Props): React.ReactElement {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renamePending, startRenameTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();

  const form = useForm<RenameValues>({
    resolver: standardSchemaResolver(RenameSchema),
    defaultValues: { name: projectName },
  });

  useEffect(() => {
    if (renameOpen) form.reset({ name: projectName });
  }, [renameOpen, projectName, form]);

  const handleRename = form.handleSubmit((values) => {
    if (values.name.trim() === projectName) {
      setRenameOpen(false);
      return;
    }
    startRenameTransition(async () => {
      const result = await updateProject({ id: projectId, name: values.name.trim() });
      if (!result.ok) {
        toast.error(`Could not rename project: ${result.error}`);
        return;
      }
      setRenameOpen(false);
      toast.success("Project renamed");
      router.refresh();
    });
  });

  const handleDelete = (): void => {
    startDeleteTransition(async () => {
      const result = await deleteProject({ id: projectId });
      if (!result.ok) {
        toast.error(`Could not delete project: ${result.error}`);
        return;
      }
      setConfirmOpen(false);
      toast.success("Project deleted");
      router.push("/");
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${projectName} project menu`}
            className={cn(
              "group/proj-menu inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-foreground transition-colors",
              "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "data-[state=open]:bg-muted",
            )}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: projectColor }}
            />
            <span className="truncate">{projectName}</span>
            <ChevronDown
              aria-hidden
              className="h-3 w-3 text-muted-foreground/70 transition-transform group-data-[state=open]/proj-menu:rotate-180"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="w-48">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <Settings className="h-4 w-4" />
            Project settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setRenameOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspaceId={workspaceId}
        projectId={projectId}
        projectDescription={projectDescription}
        projectLocalPath={projectLocalPath}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRename} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>Update the display name for this project.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-header-rename-name">Name</Label>
              <Input
                id="project-header-rename-name"
                autoFocus
                disabled={renamePending}
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <span className="text-[12px] text-destructive">
                  {form.formState.errors.name.message}
                </span>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenameOpen(false)}
                disabled={renamePending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={renamePending}>
                {renamePending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This permanently removes the project and all of its tickets. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-[13px]">
            <div className="font-medium text-foreground">{projectName}</div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

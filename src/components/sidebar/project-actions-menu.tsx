"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { deleteProject, updateProject } from "@/actions/project";
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

const RenameSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
});

type RenameValues = z.infer<typeof RenameSchema>;

type Props = {
  projectId: string;
  projectName: string;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
};

export function ProjectActionsMenu({
  projectId,
  projectName,
  onRenamed,
  onDeleted,
}: Props): React.ReactElement {
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [renamePending, startRenameTransition] = useTransition();

  const form = useForm<RenameValues>({
    resolver: standardSchemaResolver(RenameSchema),
    defaultValues: { name: projectName },
  });

  useEffect(() => {
    if (renameOpen) {
      form.reset({ name: projectName });
    }
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
      onRenamed(result.project.name);
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
      onDeleted();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${projectName}`}
            onClick={(e) => e.preventDefault()}
            className="opacity-0 transition-opacity duration-[120ms] ease-out group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="w-44">
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

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRename} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>Update the display name for this project.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-rename-name">Name</Label>
              <Input
                id="project-rename-name"
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

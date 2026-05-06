"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Folder, MoreHorizontal, Pencil, Settings, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { deleteProject, updateProject } from "@/actions/project";
import {
  getProjectDefaultWorkflow,
  listWorkflowTemplates,
  setProjectDefaultWorkflow,
} from "@/actions/workflow";
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
import { Textarea } from "@/components/ui/textarea";
import { getDesktopBridge } from "@/lib/use-is-desktop";

const RenameSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
});

type RenameValues = z.infer<typeof RenameSchema>;

type Props = {
  workspaceId: string;
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
  projectLocalPath?: string | null;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
};

export function ProjectActionsMenu({
  workspaceId,
  projectId,
  projectName,
  projectDescription,
  projectLocalPath,
  onRenamed,
  onDeleted,
}: Props): React.ReactElement {
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [description, setDescription] = useState(projectDescription ?? "");
  const [wfTemplates, setWfTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [wfTemplateId, setWfTemplateId] = useState<string>("");
  const [initialWfTemplateId, setInitialWfTemplateId] = useState<string>("");
  const [designContent, setDesignContent] = useState<string>("");
  const [initialDesignContent, setInitialDesignContent] = useState<string>("");
  const [designAvailable, setDesignAvailable] = useState<boolean>(false);
  const [designLoadError, setDesignLoadError] = useState<string | null>(null);
  const [settingsPending, startSettingsTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [renamePending, startRenameTransition] = useTransition();

  useEffect(() => {
    if (settingsOpen) {
      setFolderPath(projectLocalPath ?? "");
      setDescription(projectDescription ?? "");
      setDesignContent("");
      setInitialDesignContent("");
      setDesignLoadError(null);
      (async () => {
        const [templatesRes, defaultRes] = await Promise.all([
          listWorkflowTemplates({ workspaceId }),
          getProjectDefaultWorkflow(projectId),
        ]);
        if (templatesRes.ok) {
          setWfTemplates(templatesRes.templates.map((t) => ({ id: t.id, name: t.name })));
        }
        if (defaultRes.ok) {
          const id = defaultRes.templateId ?? "";
          setWfTemplateId(id);
          setInitialWfTemplateId(id);
        }

        const bridge = getDesktopBridge();
        const repo = projectLocalPath ?? "";
        const supported = !!bridge?.readProjectFile;
        setDesignAvailable(supported && !!repo);
        if (supported && repo) {
          // Try DESIGN.md first; fall back to design.md.
          let content = "";
          let loaded = false;
          for (const rel of ["DESIGN.md", "design.md"]) {
            const r = await bridge.readProjectFile?.({ repoPath: repo, relPath: rel });
            if (r?.ok && r.exists) {
              content = r.content ?? "";
              loaded = true;
              break;
            }
            if (r && !r.ok) setDesignLoadError(r.error ?? "read_failed");
          }
          if (!loaded) setDesignLoadError(null);
          setDesignContent(content);
          setInitialDesignContent(content);
        }
      })();
    }
  }, [settingsOpen, projectId, projectLocalPath, projectDescription]);

  const handlePickFolder = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      toast.error("Folder picker is only available in the desktop app");
      return;
    }
    const result = await bridge.pickRepoPath();
    if (!result.ok || !result.path) {
      if (result.error) toast.error(result.error);
      return;
    }
    setFolderPath(result.path);
  };

  const handleSaveSettings = (): void => {
    startSettingsTransition(async () => {
      const trimmedPath = folderPath.trim();
      const nextPath = trimmedPath === "" ? null : trimmedPath;
      const currentPath = projectLocalPath ?? null;

      const trimmedDesc = description.trim();
      const nextDesc = trimmedDesc === "" ? null : trimmedDesc;
      const currentDesc = projectDescription ?? null;

      const patch: { id: string; description?: string | null; localPath?: string | null } = {
        id: projectId,
      };
      if (nextDesc !== currentDesc) patch.description = nextDesc;
      if (nextPath !== currentPath) patch.localPath = nextPath;

      if (patch.description !== undefined || patch.localPath !== undefined) {
        const result = await updateProject(patch);
        if (!result.ok) {
          toast.error(`Could not save settings: ${result.error}`);
          return;
        }
      }

      if (designAvailable && designContent !== initialDesignContent) {
        const bridge = getDesktopBridge();
        const repo = folderPath.trim();
        if (bridge?.writeProjectFile && repo) {
          const r = await bridge.writeProjectFile({
            repoPath: repo,
            relPath: "DESIGN.md",
            content: designContent,
          });
          if (!r.ok) {
            toast.error(`Could not save DESIGN.md: ${r.error ?? "unknown"}`);
            return;
          }
          setInitialDesignContent(designContent);
        }
      }

      if (wfTemplateId !== initialWfTemplateId) {
        const r = await setProjectDefaultWorkflow({
          projectId,
          templateId: wfTemplateId === "" ? null : wfTemplateId,
        });
        if (!r.ok) {
          toast.error(`Could not save default workflow: ${r.error}`);
          return;
        }
      }
      setSettingsOpen(false);
      toast.success("Project settings saved");
    });
  };

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
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <Settings className="h-4 w-4" />
            Settings
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Project settings</DialogTitle>
            <DialogDescription>
              Configure how Planbooq works with this project locally.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-settings-folder">Local project folder</Label>
              <div className="flex gap-2">
                <Input
                  id="project-settings-folder"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="/Users/you/code/my-project"
                  disabled={settingsPending}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handlePickFolder}
                  disabled={settingsPending}
                >
                  <Folder className="h-4 w-4" />
                  Browse
                </Button>
              </div>
              <span className="text-[12px] text-muted-foreground">
                Stored on this device. Used by Claude Code to know which repo to work in.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-settings-description">Description</Label>
              <Textarea
                id="project-settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={5}
                maxLength={2000}
                disabled={settingsPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-settings-workflow">Default workflow</Label>
              <select
                id="project-settings-workflow"
                value={wfTemplateId}
                onChange={(e) => setWfTemplateId(e.target.value)}
                disabled={settingsPending}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— None —</option>
                {wfTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="text-[12px] text-muted-foreground">
                Tickets in this project use this workflow by default. Manage templates in Settings →
                Workflows.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-settings-design">DESIGN.md</Label>
              {designAvailable ? (
                <>
                  <Textarea
                    id="project-settings-design"
                    value={designContent}
                    onChange={(e) => setDesignContent(e.target.value)}
                    placeholder={
                      initialDesignContent === ""
                        ? "No DESIGN.md yet — type to create one in the project root."
                        : ""
                    }
                    rows={12}
                    disabled={settingsPending}
                    className="font-mono text-[12px]"
                  />
                  <span className="text-[12px] text-muted-foreground">
                    Saved to <code>DESIGN.md</code> in the project folder. Used as design context
                    for AI tasks.
                    {designLoadError ? ` (last read error: ${designLoadError})` : ""}
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-muted-foreground">
                  {folderPath.trim()
                    ? "Open Planbooq in the desktop app to view and edit DESIGN.md."
                    : "Set a local project folder above to enable DESIGN.md editing."}
                </span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSettingsOpen(false)}
              disabled={settingsPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveSettings} disabled={settingsPending}>
              {settingsPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
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

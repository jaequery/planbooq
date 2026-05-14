"use client";

import { Folder } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProject } from "@/actions/project";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDesktopBridge } from "@/lib/use-is-desktop";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId: string;
  projectDescription?: string | null;
  projectLocalPath?: string | null;
};

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  projectDescription,
  projectLocalPath,
}: Props): React.ReactElement {
  const [folderPath, setFolderPath] = useState("");
  const [description, setDescription] = useState(projectDescription ?? "");
  const [wfTemplates, setWfTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [wfTemplateId, setWfTemplateId] = useState<string>("");
  const [initialWfTemplateId, setInitialWfTemplateId] = useState<string>("");
  const [designContent, setDesignContent] = useState<string>("");
  const [initialDesignContent, setInitialDesignContent] = useState<string>("");
  const [designAvailable, setDesignAvailable] = useState<boolean>(false);
  const [designLoadError, setDesignLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
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
  }, [open, projectId, projectLocalPath, projectDescription, workspaceId]);

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

  const handleSave = (): void => {
    startTransition(async () => {
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
      onOpenChange(false);
      toast.success("Project settings saved");
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                disabled={pending}
              />
              <Button type="button" variant="ghost" onClick={handlePickFolder} disabled={pending}>
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
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-settings-workflow">Default workflow</Label>
            <select
              id="project-settings-workflow"
              value={wfTemplateId}
              onChange={(e) => setWfTemplateId(e.target.value)}
              disabled={pending}
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
              Tickets in this project use this workflow by default. Manage templates from the
              auto-run picker on the board.
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
                  disabled={pending}
                  className="font-mono text-[12px]"
                />
                <span className="text-[12px] text-muted-foreground">
                  Saved to <code>DESIGN.md</code> in the project folder. Used as design context for
                  AI tasks.
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
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

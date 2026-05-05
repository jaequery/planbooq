"use client";

import { Folder, Loader2, Lock, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createProjectFromRepo } from "@/actions/project";
import { type GithubRepo, listGithubRepos } from "@/actions/github";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getDesktopBridge } from "@/lib/use-is-desktop";

function repoKey(projectId: string): string {
  return `planbooq:repoPath:project:${projectId}`;
}

function GithubIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 .5C5.7.5.5 5.7.5 12.1c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.6-3.9-1.6-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CreatedProject = { id: string; slug: string; name: string };

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "needs_github" }
  | { kind: "missing_scope" }
  | { kind: "error"; message: string }
  | { kind: "ready"; repos: GithubRepo[] }
  | { kind: "needs_folder"; project: CreatedProject };

export function NewProjectDialog({ open, onOpenChange }: Props): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [_, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setState({ kind: "idle" });
      setQuery("");
      setCreatingFor(null);
      setFolderPath("");
      return;
    }
    setState({ kind: "loading" });
    void (async () => {
      const result = await listGithubRepos();
      if (result.ok) {
        setState({ kind: "ready", repos: result.repos });
        return;
      }
      if (result.error === "no_github") setState({ kind: "needs_github" });
      else if (result.error === "missing_scope") setState({ kind: "missing_scope" });
      else if (result.error === "rate_limited")
        setState({ kind: "error", message: "GitHub rate limit hit — try again in a minute." });
      else if (result.error === "unauthorized")
        setState({ kind: "error", message: "Sign in to continue." });
      else setState({ kind: "error", message: "Could not reach GitHub." });
    })();
  }, [open]);

  const filteredRepos =
    state.kind === "ready"
      ? state.repos.filter((r) => {
          if (!query.trim()) return true;
          const q = query.toLowerCase();
          return (
            r.fullName.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q)
          );
        })
      : [];

  const handlePick = (repo: GithubRepo): void => {
    setCreatingFor(repo.fullName);
    startTransition(async () => {
      const result = await createProjectFromRepo({ fullName: repo.fullName });
      if (!result.ok) {
        toast.error(`Could not create project: ${result.error}`);
        setCreatingFor(null);
        return;
      }
      toast.success(`Created “${result.project.name}”`);
      setCreatingFor(null);
      setState({
        kind: "needs_folder",
        project: {
          id: result.project.id,
          slug: result.project.slug,
          name: result.project.name,
        },
      });
    });
  };

  const goToProject = (slug: string): void => {
    onOpenChange(false);
    router.push(`/p/${slug}`);
    router.refresh();
  };

  const handleBrowseFolder = async (): Promise<void> => {
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

  const handleSaveFolder = (project: CreatedProject): void => {
    const trimmed = folderPath.trim();
    if (trimmed) localStorage.setItem(repoKey(project.id), trimmed);
    goToProject(project.slug);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state.kind === "needs_folder" ? "Choose local folder" : "New project from GitHub"}
          </DialogTitle>
          <DialogDescription>
            {state.kind === "needs_folder"
              ? `Where is ${state.project.name} cloned on this machine? Claude Code uses this path to run in the right repo.`
              : "Pick a repository — Planbooq will pull the name, description, and primary language."}
          </DialogDescription>
        </DialogHeader>

        {state.kind === "loading" || state.kind === "idle" ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading your repositories…
          </div>
        ) : null}

        {state.kind === "needs_github" || state.kind === "missing_scope" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <GithubIcon className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {state.kind === "needs_github"
                ? "Connect your GitHub account to choose a repository."
                : "Planbooq needs the “repo” scope to read your repositories."}
            </div>
            <Button asChild>
              <a href="/api/auth/signin/github?callbackUrl=/">
                <GithubIcon className="h-4 w-4" />
                Connect GitHub
              </a>
            </Button>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div className="py-8 text-center text-sm text-destructive">{state.message}</div>
        ) : null}

        {state.kind === "ready" ? (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories…"
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-80 rounded-md border border-border/60">
              <ul className="divide-y divide-border/60">
                {filteredRepos.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No repositories match.
                  </li>
                ) : (
                  filteredRepos.map((repo) => {
                    const isCreating = creatingFor === repo.fullName;
                    const disabled = creatingFor !== null;
                    return (
                      <li key={repo.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handlePick(repo)}
                          className={cn(
                            "flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors",
                            "hover:bg-foreground/[0.04] disabled:opacity-50 disabled:hover:bg-transparent",
                          )}
                        >
                          <div className="flex w-full items-center gap-2 text-[13px]">
                            <span className="font-medium text-foreground">{repo.fullName}</span>
                            {repo.private ? (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            ) : null}
                            {repo.language ? (
                              <span className="ml-auto text-[11px] text-muted-foreground">
                                {repo.language}
                              </span>
                            ) : null}
                            {isCreating ? (
                              <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
                            ) : null}
                          </div>
                          {repo.description ? (
                            <span className="line-clamp-1 text-[12px] text-muted-foreground">
                              {repo.description}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </ScrollArea>
          </div>
        ) : null}

        {state.kind === "needs_folder" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="np-folder">Local folder</Label>
            <div className="flex gap-2">
              <Input
                id="np-folder"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/Users/you/code/my-project"
                autoFocus
              />
              <Button type="button" variant="ghost" onClick={handleBrowseFolder}>
                <Folder className="h-4 w-4" />
                Browse
              </Button>
            </div>
            <span className="text-[12px] text-muted-foreground">
              Stored on this device. You can change it later in project settings.
            </span>
          </div>
        ) : null}

        <DialogFooter>
          {state.kind === "needs_folder" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => goToProject(state.project.slug)}
              >
                Skip
              </Button>
              <Button type="button" onClick={() => handleSaveFolder(state.project)}>
                Save folder
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={creatingFor !== null}
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

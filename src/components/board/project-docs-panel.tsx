"use client";

import { ChevronDown, ChevronRight, Code2, FileText, Loader2, Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const MarkdownWysiwygEditor = dynamic(
  () => import("./markdown-wysiwyg-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-md border border-border/60 bg-background text-[12px] text-muted-foreground">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading editor…
      </div>
    ),
  },
);
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getDesktopBridge } from "@/lib/use-is-desktop";

type DocKey = "claude" | "agent" | "readme";

const DOCS: ReadonlyArray<{ key: DocKey; label: string; relPath: string; fallback?: string }> = [
  { key: "readme", label: "README.md", relPath: "README.md" },
  { key: "claude", label: "CLAUDE.md", relPath: "CLAUDE.md" },
  { key: "agent", label: "AGENT.md", relPath: "AGENT.md", fallback: "AGENTS.md" },
];

type ViewMode = "editor" | "code";

type DocState = {
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  content: string;
  initial: string;
  resolvedRel: string;
  error: string | null;
};

const emptyDoc = (rel: string): DocState => ({
  loaded: false,
  loading: false,
  saving: false,
  content: "",
  initial: "",
  resolvedRel: rel,
  error: null,
});

type Props = { localPath: string | null };

export function ProjectDocsPanel({ localPath }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DocKey>("readme");
  const [view, setView] = useState<ViewMode>("editor");
  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    claude: emptyDoc("CLAUDE.md"),
    agent: emptyDoc("AGENT.md"),
    readme: emptyDoc("README.md"),
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const bridge = mounted ? getDesktopBridge() : null;
  const supported = mounted && !!bridge?.readProjectFile && !!bridge?.writeProjectFile;
  const repo = localPath?.trim() ?? "";

  const loadDoc = useCallback(
    async (key: DocKey): Promise<void> => {
      const cfg = DOCS.find((d) => d.key === key);
      if (!cfg) return;
      const b = getDesktopBridge();
      if (!b?.readProjectFile || !repo) return;
      setDocs((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: null } }));
      const tries = cfg.fallback ? [cfg.relPath, cfg.fallback] : [cfg.relPath];
      let content = "";
      let resolvedRel = cfg.relPath;
      let lastError: string | null = null;
      for (const rel of tries) {
        const r = await b.readProjectFile({ repoPath: repo, relPath: rel });
        if (r.ok && r.exists) {
          content = r.content ?? "";
          resolvedRel = rel;
          lastError = null;
          break;
        }
        if (r.ok && !r.exists) {
          lastError = null;
          // keep checking fallbacks; if all missing, leave content empty at primary path
          resolvedRel = cfg.relPath;
          continue;
        }
        if (!r.ok) lastError = r.error ?? "read_failed";
      }
      setDocs((prev) => ({
        ...prev,
        [key]: {
          loaded: true,
          loading: false,
          saving: false,
          content,
          initial: content,
          resolvedRel,
          error: lastError,
        },
      }));
    },
    [repo],
  );

  // Lazy-load the active doc on first open / tab switch.
  useEffect(() => {
    if (!open || !supported || !repo) return;
    const cur = docs[activeTab];
    if (!cur.loaded && !cur.loading) {
      void loadDoc(activeTab);
    }
  }, [open, supported, repo, activeTab, docs, loadDoc]);

  // ESC closes the expanded panel.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const current = docs[activeTab];
  const isDirty = current.loaded && current.content !== current.initial;

  const handleSave = useCallback(async (): Promise<void> => {
    const b = getDesktopBridge();
    if (!b?.writeProjectFile || !repo) {
      toast.error("Desktop app required to save files");
      return;
    }
    setDocs((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], saving: true } }));
    const r = await b.writeProjectFile({
      repoPath: repo,
      relPath: current.resolvedRel,
      content: current.content,
    });
    if (!r.ok) {
      toast.error(`Could not save ${current.resolvedRel}: ${r.error ?? "unknown"}`);
      setDocs((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], saving: false } }));
      return;
    }
    toast.success(`Saved ${current.resolvedRel}`);
    setDocs((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], saving: false, initial: prev[activeTab].content },
    }));
  }, [activeTab, current.content, current.resolvedRel, repo]);

  const onChangeContent = (val: string): void => {
    setDocs((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], content: val } }));
  };

  const summary = useMemo(() => {
    if (!mounted) return "";
    if (!supported) return "Desktop app required";
    if (!repo) return "Set project folder in settings";
    return "README.md · CLAUDE.md · AGENT.md";
  }, [mounted, supported, repo]);

  return (
    <div className="border-b border-border/60 bg-card/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <FileText className="h-3.5 w-3.5" />
        <span className="text-foreground">Project docs</span>
        <span className="text-muted-foreground/70">— {summary}</span>
      </button>
      {open ? (
        <div className="px-4 pb-3">
          {!supported || !repo ? (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-[12px] text-muted-foreground">
              {!supported
                ? "Editing project docs requires the Planbooq desktop app."
                : "Pick a project folder in project settings to enable docs editing."}
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocKey)}>
              <div className="flex items-center justify-between gap-2">
                <TabsList>
                  {DOCS.map((d) => (
                    <TabsTrigger key={d.key} value={d.key}>
                      {d.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="flex items-center gap-1">
                  <div className="inline-flex h-7 items-center rounded-md border border-border/60 p-0.5">
                    <button
                      type="button"
                      onClick={() => setView("editor")}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded px-2 text-[12px] transition-colors",
                        view === "editor"
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={view === "editor"}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("code")}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded px-2 text-[12px] transition-colors",
                        view === "code"
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={view === "code"}
                    >
                      <Code2 className="h-3.5 w-3.5" /> Code
                    </button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="h-7 px-2 text-[12px]"
                    onClick={handleSave}
                    disabled={!isDirty || current.saving}
                  >
                    {current.saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save
                  </Button>
                </div>
              </div>
              {DOCS.map((d) => {
                const state = docs[d.key];
                return (
                  <TabsContent key={d.key} value={d.key} className="mt-2">
                    {state.error ? (
                      <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-[12px] text-destructive">
                        {state.error}
                      </div>
                    ) : null}
                    {state.loading && !state.loaded ? (
                      <div className="flex h-40 items-center justify-center text-[12px] text-muted-foreground">
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
                      </div>
                    ) : view === "code" ? (
                      <Textarea
                        value={state.content}
                        onChange={(e) => onChangeContent(e.target.value)}
                        spellCheck={false}
                        className="h-64 max-h-[60vh] resize-y overflow-auto font-mono text-[12px] leading-relaxed"
                        placeholder={`# ${d.label}\n\nWrite project instructions here…`}
                      />
                    ) : (
                      <MarkdownWysiwygEditor
                        value={state.content}
                        onChange={onChangeContent}
                        placeholder={`Write ${d.label} here…`}
                      />
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </div>
      ) : null}
    </div>
  );
}

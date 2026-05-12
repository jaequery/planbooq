"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getProjectDefaultWorkflow,
  getWorkflowTemplate,
  listWorkflowTemplates,
} from "@/actions/workflow";
import { StepList } from "@/components/settings/workflows-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LocalStep = {
  id: string;
  name: string;
  prompt: string;
  position: number;
  enabled: boolean;
};

type TemplateRow = { id: string; name: string; description: string | null; stepCount: number };

export type TicketWorkflowDraft = {
  /** Steps the user assembled, in display order. May be empty (= clear override). */
  steps: Array<{ name: string; prompt: string; enabled: boolean }>;
  /** True when the user picked a non-default template or edited steps. When
   *  false, the parent can skip the post-create `replaceTicketWorkflowSteps`
   *  call and let the project default apply via `getTicketWorkflow`. */
  dirty: boolean;
};

export type TicketCreateWorkflowPanelHandle = {
  getDraft: () => TicketWorkflowDraft;
};

let __localStepCounter = 0;
function nextLocalId(): string {
  __localStepCounter += 1;
  return `local-${Date.now().toString(36)}-${__localStepCounter}`;
}

export const TicketCreateWorkflowPanel = forwardRef<
  TicketCreateWorkflowPanelHandle,
  { workspaceId: string; projectId: string }
>(function TicketCreateWorkflowPanel({ workspaceId, projectId }, ref): React.ReactElement | null {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [steps, setSteps] = useState<LocalStep[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish "user touched the workflow" from "panel hydrated from
  // template fetch" so unmodified creations skip the post-create override
  // write and inherit the project default cleanly.
  const dirtyRef = useRef(false);

  const seedFromTemplate = useCallback(async (templateId: string) => {
    const res = await getWorkflowTemplate(templateId);
    if (!res.ok) {
      // Template might have been deleted in another tab. Fall back to empty.
      setSteps([]);
      return;
    }
    setSteps(
      res.template.steps.map((s) => ({
        id: nextLocalId(),
        name: s.name,
        prompt: s.prompt,
        position: s.position,
        enabled: s.enabled,
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [list, def] = await Promise.all([
        listWorkflowTemplates({ workspaceId }),
        getProjectDefaultWorkflow(projectId),
      ]);
      if (cancelled) return;
      const rows = list.ok ? list.templates : [];
      const defaultId = def.ok ? def.templateId : null;
      setTemplates(rows);
      setDefaultTemplateId(defaultId);
      const initial = defaultId ?? rows[0]?.id ?? null;
      setSelectedTemplateId(initial);
      if (initial) {
        await seedFromTemplate(initial);
      } else {
        setSteps([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId, seedFromTemplate]);

  useImperativeHandle(
    ref,
    () => ({
      getDraft: () => ({
        steps: steps.map((s) => ({
          name: s.name,
          prompt: s.prompt,
          enabled: s.enabled,
        })),
        dirty: dirtyRef.current,
      }),
    }),
    [steps],
  );

  function pickTemplate(templateId: string) {
    if (templateId === selectedTemplateId) return;
    setSelectedTemplateId(templateId);
    dirtyRef.current = true;
    void seedFromTemplate(templateId);
  }

  async function handleAdd(name: string, prompt: string): Promise<boolean> {
    setSteps((prev) => {
      const lastPos = prev.length > 0 ? (prev[prev.length - 1]?.position ?? 0) : 0;
      return [
        ...prev,
        {
          id: nextLocalId(),
          name: name.trim(),
          prompt: prompt.trim() || "Describe what this step should do.",
          position: lastPos + 1024,
          enabled: true,
        },
      ];
    });
    dirtyRef.current = true;
    return true;
  }

  async function handleUpdate(
    id: string,
    patch: { name?: string; prompt?: string; enabled?: boolean },
  ): Promise<void> {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    dirtyRef.current = true;
  }

  async function handleRemove(id: string): Promise<void> {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    dirtyRef.current = true;
  }

  async function handleReorder(orderedStepIds: string[]): Promise<void> {
    setSteps((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      const next: LocalStep[] = [];
      for (let i = 0; i < orderedStepIds.length; i++) {
        const stepId = orderedStepIds[i];
        if (!stepId) continue;
        const found = byId.get(stepId);
        if (found) next.push({ ...found, position: (i + 1) * 1024 });
      }
      return next;
    });
    dirtyRef.current = true;
  }

  // While loading the initial fetch, render a stable shell with no controls so
  // the dialog height does not jump.
  if (loading) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Workflow
          </span>
          <span className="text-[11px] text-muted-foreground/50">Loading…</span>
        </div>
      </div>
    );
  }

  const selected =
    selectedTemplateId != null ? templates.find((t) => t.id === selectedTemplateId) : null;
  const currentLabel =
    selected?.name ?? (templates.length === 0 ? "No workflows" : "Pick a workflow");
  const enabledCount = steps.filter((s) => s.enabled).length;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
      <header className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
          Workflow
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={templates.length === 0}
              className="flex min-w-0 items-center gap-1 rounded text-right text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="truncate">{currentLabel}</span>
              {steps.length > 0 && (
                <span className="shrink-0 text-[11px] text-muted-foreground/60">
                  {enabledCount}/{steps.length}
                </span>
              )}
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {templates.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No templates yet. Create one in Settings → Workflows.
              </div>
            ) : (
              templates.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => pickTemplate(t.id)}>
                  <span className="truncate">{t.name}</span>
                  {t.id === defaultTemplateId ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                      default
                    </span>
                  ) : null}
                  <span className="ml-auto pl-2 text-[11px] text-muted-foreground">
                    {t.stepCount}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {templates.length === 0 && steps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">
          You can add steps directly here — they will be saved as this ticket&apos;s workflow.
        </p>
      ) : null}

      <div className="max-h-[260px] overflow-y-auto">
        <StepList
          steps={steps.map((s) => ({
            id: s.id,
            name: s.name,
            prompt: s.prompt,
            position: s.position,
            enabled: s.enabled,
          }))}
          onAdd={async (name, prompt) => {
            try {
              return await handleAdd(name, prompt);
            } catch (e) {
              toast.error(`Could not add step: ${e instanceof Error ? e.message : "unknown"}`);
              return false;
            }
          }}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          onReorder={handleReorder}
        />
      </div>
    </div>
  );
});

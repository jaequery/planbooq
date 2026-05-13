"use client";

import { ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addTemplateStep,
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  getWorkflowTemplate,
  listWorkflowTemplates,
  removeTemplateStep,
  reorderTemplateSteps,
  updateTemplateStep,
  updateWorkflowTemplate,
} from "@/actions/workflow";
import { StepList } from "@/components/settings/workflows-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
};

type Step = { id: string; name: string; prompt: string; position: number; enabled: boolean };
type FullTemplate = { id: string; name: string; description: string | null; steps: Step[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  defaultWorkflowTemplateId: string | null;
  onMutated?: () => void;
};

export function WorkflowManagerDialog({
  open,
  onOpenChange,
  workspaceId,
  defaultWorkflowTemplateId,
  onMutated,
}: Props): React.ReactElement {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, startCreate] = useTransition();
  const newInputRef = useRef<HTMLInputElement | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<FullTemplate | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWorkflowTemplates({ workspaceId });
      if (!res.ok) {
        toast.error(`Could not load workflows: ${res.error}`);
        return;
      }
      setTemplates(res.templates);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadExpanded = useCallback(async (id: string) => {
    setExpandedLoading(true);
    try {
      const res = await getWorkflowTemplate(id);
      if (!res.ok) {
        toast.error(`Could not load workflow: ${res.error}`);
        setExpandedTemplate(null);
        return;
      }
      setExpandedTemplate(res.template);
    } finally {
      setExpandedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    requestAnimationFrame(() => newInputRef.current?.focus());
  }, [open, refresh]);

  useEffect(() => {
    if (!open) {
      setExpandedId(null);
      setExpandedTemplate(null);
    }
  }, [open]);

  useEffect(() => {
    if (expandedId) void loadExpanded(expandedId);
    else setExpandedTemplate(null);
  }, [expandedId, loadExpanded]);

  function onCreate(): void {
    const name = newName.trim();
    if (!name) return;
    startCreate(async () => {
      const res = await createWorkflowTemplate({ workspaceId, name });
      if (!res.ok) {
        toast.error(`Could not create workflow: ${res.error}`);
        return;
      }
      setNewName("");
      await refresh();
      onMutated?.();
      newInputRef.current?.focus();
    });
  }

  async function onRename(id: string, nextName: string, prevName: string): Promise<void> {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === prevName) return;
    const res = await updateWorkflowTemplate({ id, name: trimmed });
    if (!res.ok) {
      toast.error(`Could not rename: ${res.error}`);
      await refresh();
      return;
    }
    await refresh();
    onMutated?.();
  }

  async function onUpdateDescription(id: string, nextDescription: string): Promise<void> {
    const trimmed = nextDescription.trim();
    const next = trimmed === "" ? null : trimmed;
    const res = await updateWorkflowTemplate({ id, description: next });
    if (!res.ok) {
      toast.error(`Could not save description: ${res.error}`);
      return;
    }
    await refresh();
    if (expandedId === id) await loadExpanded(id);
    onMutated?.();
  }

  async function onDelete(id: string, name: string): Promise<void> {
    if (!confirm(`Delete "${name}"? Tickets using this workflow will fall back to no workflow.`))
      return;
    const res = await deleteWorkflowTemplate(id);
    if (!res.ok) {
      toast.error(`Could not delete: ${res.error}`);
      return;
    }
    if (expandedId === id) setExpandedId(null);
    await refresh();
    onMutated?.();
  }

  async function refreshAfterStepChange(id: string): Promise<void> {
    await Promise.all([refresh(), loadExpanded(id)]);
    onMutated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 p-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">Workflows</DialogTitle>
          <DialogDescription className="text-[12px]">
            Reusable lists of AI instructions. Expand a workflow to edit its steps inline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            {loading && templates === null ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Loading workflows…
              </div>
            ) : templates && templates.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {templates.map((t) => (
                  <TemplateRowItem
                    key={t.id}
                    template={t}
                    isDefault={t.id === defaultWorkflowTemplateId}
                    expanded={expandedId === t.id}
                    expandedTemplate={expandedId === t.id ? expandedTemplate : null}
                    expandedLoading={expandedId === t.id && expandedLoading}
                    onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                    onRename={(next) => onRename(t.id, next, t.name)}
                    onDescriptionSave={(next) => onUpdateDescription(t.id, next)}
                    onDelete={() => onDelete(t.id, t.name)}
                    onStepsChanged={() => refreshAfterStepChange(t.id)}
                  />
                ))}
              </ul>
            ) : (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                No workflows yet. Create your first one below.
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreate();
            }}
            className="flex items-center gap-2 border-t pt-3"
          >
            <Input
              ref={newInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New workflow name"
              maxLength={120}
              disabled={creating}
              className="h-8 text-[13px]"
              aria-label="New workflow name"
            />
            <Button
              type="submit"
              size="sm"
              disabled={creating || !newName.trim()}
              className="h-8 gap-1.5 text-[12px]"
            >
              {creating ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-3" aria-hidden />
              )}
              Create
            </Button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {templates ? `${templates.length} workflow${templates.length === 1 ? "" : "s"}` : ""}
            </span>
            <a
              href="/settings?tab=workflows"
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
            >
              Open in Settings
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateRowItem({
  template,
  isDefault,
  expanded,
  expandedTemplate,
  expandedLoading,
  onToggleExpand,
  onRename,
  onDescriptionSave,
  onDelete,
  onStepsChanged,
}: {
  template: TemplateRow;
  isDefault: boolean;
  expanded: boolean;
  expandedTemplate: FullTemplate | null;
  expandedLoading: boolean;
  onToggleExpand: () => void;
  onRename: (next: string) => Promise<void>;
  onDescriptionSave: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onStepsChanged: () => Promise<void>;
}): React.ReactElement {
  const [name, setName] = useState(template.name);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState(template.description ?? "");

  useEffect(() => {
    setName(template.name);
  }, [template.name]);

  useEffect(() => {
    setDescription(template.description ?? "");
  }, [template.description]);

  return (
    <li className="group flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? `Collapse ${template.name}` : `Expand ${template.name}`}
          aria-expanded={expanded}
          title={expanded ? "Hide steps" : "Edit steps"}
          className="-ml-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="size-3" aria-hidden />
          ) : (
            <ChevronRight className="size-3" aria-hidden />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                if (name.trim() === template.name || !name.trim()) {
                  setName(template.name);
                  return;
                }
                setBusy(true);
                try {
                  await onRename(name);
                } finally {
                  setBusy(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setName(template.name);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              disabled={busy}
              aria-label={`Workflow name for ${template.name}`}
              className="min-w-0 flex-1 truncate bg-transparent text-[13px] font-medium outline-none focus:underline focus:underline-offset-2"
            />
            {isDefault ? (
              <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                default
              </span>
            ) : null}
          </div>
          <span className="truncate text-[11px] text-muted-foreground">
            {template.stepCount} {template.stepCount === 1 ? "step" : "steps"}
            {template.description ? ` · ${template.description}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void onDelete();
          }}
          aria-label={`Delete ${template.name}`}
          title="Delete workflow"
          className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="size-3" aria-hidden />
        </button>
      </div>
      {expanded ? (
        <div className="flex flex-col gap-2 border-t bg-muted/20 px-3 py-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`wf-desc-${template.id}`}
              className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Description
            </label>
            <Input
              id={`wf-desc-${template.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description.trim() === (template.description ?? "").trim()) return;
                void onDescriptionSave(description);
              }}
              placeholder="What this workflow is for"
              maxLength={500}
              className="h-7 bg-background text-[12px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Steps
            </span>
            {expandedLoading && !expandedTemplate ? (
              <div className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Loading steps…
              </div>
            ) : expandedTemplate ? (
              <StepList
                steps={expandedTemplate.steps}
                onAdd={async (stepName, prompt) => {
                  const res = await addTemplateStep({
                    templateId: expandedTemplate.id,
                    name: stepName,
                    prompt,
                  });
                  if (!res.ok) {
                    toast.error(`Could not add step: ${res.error}`);
                    return false;
                  }
                  await onStepsChanged();
                  return true;
                }}
                onUpdate={async (id, patch) => {
                  const res = await updateTemplateStep({ id, ...patch });
                  if (!res.ok) {
                    toast.error(`Could not update step: ${res.error}`);
                    return;
                  }
                  await onStepsChanged();
                }}
                onRemove={async (id) => {
                  const res = await removeTemplateStep(id);
                  if (!res.ok) {
                    toast.error(`Could not remove step: ${res.error}`);
                    return;
                  }
                  await onStepsChanged();
                }}
                onReorder={async (orderedStepIds) => {
                  const res = await reorderTemplateSteps({
                    templateId: expandedTemplate.id,
                    orderedStepIds,
                  });
                  if (!res.ok) {
                    toast.error(`Could not reorder steps: ${res.error}`);
                    return;
                  }
                  await onStepsChanged();
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

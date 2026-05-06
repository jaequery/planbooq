"use client";

import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TemplateRow = { id: string; name: string; description: string | null; stepCount: number };
type Step = { id: string; name: string; prompt: string; position: number; enabled: boolean };
type FullTemplate = { id: string; name: string; description: string | null; steps: Step[] };

type Props = { initialTemplates: TemplateRow[] };

export function WorkflowsClient({ initialTemplates }: Props): React.ReactElement {
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [activeId, setActiveId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [active, setActive] = useState<FullTemplate | null>(null);
  const [pending, start] = useTransition();
  const [creatingName, setCreatingName] = useState("");

  async function refreshList() {
    const res = await listWorkflowTemplates();
    if (res.ok) setTemplates(res.templates);
  }

  async function loadActive(id: string) {
    const res = await getWorkflowTemplate(id);
    if (res.ok) setActive(res.template);
    else setActive(null);
  }

  useEffect(() => {
    if (activeId) loadActive(activeId);
    else setActive(null);
  }, [activeId]);

  function onCreate() {
    const name = creatingName.trim();
    if (!name) return;
    start(async () => {
      const res = await createWorkflowTemplate({ name });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCreatingName("");
      await refreshList();
      setActiveId(res.id);
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this template? Tickets using it will fall back to no workflow.")) return;
    start(async () => {
      const res = await deleteWorkflowTemplate(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (activeId === id) setActiveId(null);
      await refreshList();
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                activeId === t.id ? "border-foreground bg-muted/50" : "hover:bg-muted/30"
              }`}
            >
              <span className="truncate">{t.name}</span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                {t.stepCount} step{t.stepCount === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            placeholder="New template name"
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCreate();
              }
            }}
          />
          <Button size="sm" onClick={onCreate} disabled={pending || !creatingName.trim()}>
            <Plus className="size-4" />
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        {!active ? (
          <p className="text-sm text-muted-foreground">
            Select a template, or create one to define a reusable workflow.
          </p>
        ) : (
          <TemplateEditor
            key={active.id}
            template={active}
            onChanged={async () => {
              await loadActive(active.id);
              await refreshList();
            }}
            onDelete={() => onDelete(active.id)}
          />
        )}
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onChanged,
  onDelete,
}: {
  template: FullTemplate;
  onChanged: () => Promise<void>;
  onDelete: () => void;
}): React.ReactElement {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [pending, start] = useTransition();

  function saveMeta() {
    if (name.trim() === template.name && description === (template.description ?? "")) return;
    start(async () => {
      const res = await updateWorkflowTemplate({
        id: template.id,
        name: name.trim(),
        description: description.trim() || null,
      });
      if (!res.ok) toast.error(res.error);
      else await onChanged();
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div>
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveMeta}
            />
          </div>
          <div>
            <Label htmlFor="wf-desc">Description</Label>
            <Textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveMeta}
              placeholder="What this workflow is for"
              rows={2}
            />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      <StepList
        steps={template.steps}
        onAdd={async (name, prompt) => {
          const res = await addTemplateStep({ templateId: template.id, name, prompt });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          await onChanged();
          return true;
        }}
        onUpdate={async (id, patch) => {
          const res = await updateTemplateStep({ id, ...patch });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          await onChanged();
        }}
        onRemove={async (id) => {
          const res = await removeTemplateStep(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          await onChanged();
        }}
        onReorder={async (orderedStepIds) => {
          const res = await reorderTemplateSteps({ templateId: template.id, orderedStepIds });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          await onChanged();
        }}
      />
    </section>
  );
}

export function StepList({
  steps,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: {
  steps: Step[];
  onAdd: (name: string, prompt: string) => Promise<boolean>;
  onUpdate: (id: string, patch: { name?: string; prompt?: string; enabled?: boolean }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (orderedStepIds: string[]) => Promise<void>;
}): React.ReactElement {
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [pending, start] = useTransition();

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    const a = next[idx];
    const b = next[target];
    if (!a || !b) return;
    next[idx] = b;
    next[target] = a;
    start(async () => {
      await onReorder(next.map((s) => s.id));
    });
  }

  function addStep() {
    const n = newName.trim();
    const p = newPrompt.trim();
    if (!n || !p) return;
    start(async () => {
      const ok = await onAdd(n, p);
      if (ok) {
        setNewName("");
        setNewPrompt("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Steps</h3>
        <span className="text-xs text-muted-foreground">
          Run top-to-bottom. Disable to skip without deleting.
        </span>
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground">No steps yet — add one below.</p>
      )}

      <ul className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <StepRow
            key={s.id}
            step={s}
            index={i}
            disableUp={i === 0 || pending}
            disableDown={i === steps.length - 1 || pending}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onUpdate={(patch) => start(async () => onUpdate(s.id, patch))}
            onRemove={() => start(async () => onRemove(s.id))}
          />
        ))}
      </ul>

      <div className="rounded-md border bg-muted/20 p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Add a step</div>
        <div className="flex flex-col gap-2">
          <Input
            placeholder='Step name (e.g. "Security analysis")'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Textarea
            placeholder="Prompt (what the AI should do for this step)"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={addStep} disabled={pending || !newName.trim() || !newPrompt.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add step
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  disableUp,
  disableDown,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}: {
  step: Step;
  index: number;
  disableUp: boolean;
  disableDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (patch: { name?: string; prompt?: string; enabled?: boolean }) => void;
  onRemove: () => void;
}): React.ReactElement {
  const [name, setName] = useState(step.name);
  const [prompt, setPrompt] = useState(step.prompt);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setName(step.name);
    setPrompt(step.prompt);
  }, [step.name, step.prompt]);

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 shrink-0 text-muted-foreground" />
        <span className="w-6 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== step.name) onUpdate({ name: name.trim() });
          }}
          className="flex-1"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={step.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
          />
          on
        </label>
        <Button size="icon" variant="ghost" onClick={onMoveUp} disabled={disableUp}>
          <ChevronUp className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onMoveDown} disabled={disableDown}>
          <ChevronDown className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setOpen((v) => !v)}>
          <span className="text-xs">{open ? "−" : "✎"}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {open && (
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => {
            if (prompt.trim() && prompt !== step.prompt) onUpdate({ prompt: prompt.trim() });
          }}
          rows={4}
        />
      )}
    </li>
  );
}

"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
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

type Props = { workspaceId: string; initialTemplates: TemplateRow[] };

export function WorkflowsClient({ workspaceId, initialTemplates }: Props): React.ReactElement {
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [activeId, setActiveId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [active, setActive] = useState<FullTemplate | null>(null);
  const [pending, start] = useTransition();
  const [creatingName, setCreatingName] = useState("");
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (templates.length === 0) createInputRef.current?.focus();
  }, [templates.length]);

  async function refreshList() {
    const res = await listWorkflowTemplates({ workspaceId });
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
      const res = await createWorkflowTemplate({ workspaceId, name });
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Workflows</h2>
        <p className="max-w-prose text-xs text-muted-foreground">
          Reusable lists of AI instructions. Apply one to a project or ticket and each step runs in
          order.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-[180px_1fr]">
        <aside className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            {templates.length === 0 && (
              <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                No templates yet.
              </div>
            )}
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
                  activeId === t.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground/70">{t.stepCount}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              ref={createInputRef}
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
            <div className="flex h-full min-h-[160px] items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {templates.length === 0
                ? "Create your first template to start defining workflow steps."
                : "Select a template on the left to edit its steps."}
            </div>
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
    </section>
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
    <section className="flex flex-col divide-y rounded-md border bg-card">
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="wf-name" className="text-xs">
            Name
          </Label>
          <Input
            id="wf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveMeta}
            className="h-8 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="wf-desc" className="text-xs">
            Description
          </Label>
          <Input
            id="wf-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveMeta}
            placeholder="What this workflow is for"
            className="h-8 text-[13px]"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Steps
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={pending}
          className="-mr-2 h-6 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
          Delete template
        </Button>
      </div>

      <div className="px-3 py-1.5">
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
      </div>
    </section>
  );
}

export function StepList({
  steps,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  onRunStep,
  stepStatus,
}: {
  steps: Step[];
  onAdd: (name: string, prompt: string) => Promise<boolean>;
  onUpdate: (
    id: string,
    patch: { name?: string; prompt?: string; enabled?: boolean },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (orderedStepIds: string[]) => Promise<void>;
  onRunStep?: (step: Step) => void;
  stepStatus?: (step: Step) => "pending" | "running" | "completed";
}): React.ReactElement {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(steps, oldIndex, newIndex);
    start(async () => {
      await onReorder(next.map((s) => s.id));
    });
  }

  function addStep() {
    const n = newName.trim();
    if (!n) {
      setAdding(false);
      return;
    }
    start(async () => {
      const ok = await onAdd(n, "Describe what this step should do.");
      if (ok) {
        setNewName("");
        setAdding(false);
      }
    });
  }

  return (
    <div className="flex flex-col">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col">
            {steps.map((s, i) => (
              <StepRow
                key={s.id}
                step={s}
                index={i}
                onUpdate={(patch) => start(async () => onUpdate(s.id, patch))}
                onRemove={() => start(async () => onRemove(s.id))}
                onRun={onRunStep ? () => onRunStep(s) : undefined}
                status={stepStatus?.(s) ?? "pending"}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div
        className={`flex items-center gap-2 py-1.5 ${
          steps.length > 0 ? "border-t border-border/40" : ""
        }`}
      >
        {adding ? (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/40">
              {pending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            </span>
            <input
              ref={addInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addStep();
                } else if (e.key === "Escape") {
                  setNewName("");
                  setAdding(false);
                }
              }}
              onBlur={addStep}
              placeholder="Step name"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
            />
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={pending}
            className="-ml-1 h-6 gap-1.5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            Add Step
          </Button>
        )}
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  onUpdate,
  onRemove,
  onRun,
  status = "pending",
}: {
  step: Step;
  index: number;
  onUpdate: (patch: { name?: string; prompt?: string; enabled?: boolean }) => void;
  onRemove: () => void;
  onRun?: () => void;
  status?: "pending" | "running" | "completed";
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [name, setName] = useState(step.name);
  const [prompt, setPrompt] = useState(step.prompt);
  const [expanded, setExpanded] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(step.name);
    setPrompt(step.prompt);
  }, [step.name, step.prompt]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group flex flex-col border-b border-border/40 py-0.5 last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="-ml-1 flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3" />
        </button>
        <input
          type="checkbox"
          checked={step.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          aria-label={step.enabled ? "Disable step" : "Enable step"}
          className="size-3 shrink-0 cursor-pointer accent-foreground"
        />
        <span
          className="flex w-5 shrink-0 items-center justify-end text-[10px] tabular-nums text-muted-foreground/60"
          aria-label={`Step ${status}`}
          title={
            status === "completed" ? "Completed" : status === "running" ? "Running" : "Pending"
          }
        >
          {status === "completed" ? (
            <Check className="size-3 text-emerald-500/80" aria-hidden />
          ) : status === "running" ? (
            <Loader2 className="size-3 animate-spin text-foreground/70" aria-hidden />
          ) : (
            <>{index + 1}.</>
          )}
        </span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== step.name) onUpdate({ name: name.trim() });
            else if (!name.trim()) setName(step.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              nameRef.current?.blur();
            } else if (e.key === "Escape") {
              setName(step.name);
              nameRef.current?.blur();
            }
          }}
          className={`flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted-foreground/50 ${
            step.enabled ? "" : "text-muted-foreground line-through"
          }`}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Hide instructions" : "Show instructions"}
          aria-expanded={expanded}
          title={expanded ? "Hide instructions" : "Show instructions"}
          className="text-muted-foreground/40 transition-colors hover:text-foreground"
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        {onRun && (
          <button
            type="button"
            onClick={onRun}
            aria-label="Run this step"
            title="Run this step"
            className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <Play className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete step"
          className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-150 ease-out group-focus-within:grid-rows-[1fr] ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => {
            if (prompt.trim() && prompt !== step.prompt) onUpdate({ prompt: prompt.trim() });
          }}
          rows={2}
          className="ml-12 min-h-0 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0"
          placeholder="Instructions for this step"
        />
      </div>
    </li>
  );
}

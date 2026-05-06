"use client";

import { ChevronDown, ChevronUp, Loader2, Play, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addTicketStep,
  disableTicketWorkflowOverride,
  enableTicketWorkflowOverride,
  getTicketWorkflow,
  removeTicketStep,
  reorderTicketSteps,
  triggerWorkflowRun,
  updateTicketStep,
} from "@/actions/workflow";
import { StepList } from "@/components/settings/workflows-client";
import { Button } from "@/components/ui/button";

type WorkflowState = {
  hasOverride: boolean;
  templateId: string | null;
  templateName: string | null;
  steps: Array<{
    id: string | null;
    name: string;
    prompt: string;
    position: number;
    enabled: boolean;
    source: "ticket" | "template";
  }>;
};

export function TicketWorkflowPanel({ ticketId }: { ticketId: string }): React.ReactElement {
  const [wf, setWf] = useState<WorkflowState | null>(null);
  const [pending, start] = useTransition();
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function refresh() {
    const a = await getTicketWorkflow(ticketId);
    if (a.ok) {
      setWf({
        hasOverride: a.hasOverride,
        templateId: a.templateId,
        templateName: a.templateName,
        steps: a.steps,
      });
    }
  }

  useEffect(() => {
    refresh();
  }, [ticketId]);

  if (!wf) {
    return <p className="text-sm text-muted-foreground">Loading workflow…</p>;
  }

  const enabledCount = wf.steps.filter((s) => s.enabled).length;
  const editable = wf.hasOverride;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {wf.hasOverride
              ? "Custom workflow"
              : wf.templateName
                ? `Project default: ${wf.templateName}`
                : "No workflow"}
          </span>
          <span className="text-xs text-muted-foreground">
            {enabledCount} step{enabledCount === 1 ? "" : "s"} will run · output streams to the
            Agent tab
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!wf.hasOverride && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                start(async () => {
                  const r = await enableTicketWorkflowOverride(ticketId);
                  if (!r.ok) toast.error(r.error);
                  await refresh();
                })
              }
              disabled={pending}
              title="Make a ticket-only copy of these steps you can edit freely"
            >
              <Settings2 className="size-4" />
              Customize
            </Button>
          )}
          {wf.hasOverride && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingReset(true)}
              disabled={pending}
              title="Delete custom steps and inherit the project default again"
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={() =>
              start(async () => {
                const enabledSteps = wf.steps.filter((s) => s.enabled);
                if (enabledSteps.length === 0) {
                  toast.error("Add at least one enabled step");
                  return;
                }
                const prompts = enabledSteps.map(
                  (s, i) =>
                    `[Workflow ${i + 1}/${enabledSteps.length}: ${s.name}]\n${s.prompt}`,
                );
                window.dispatchEvent(
                  new CustomEvent("planbooq:workflow-run", {
                    detail: { ticketId, prompts },
                  }),
                );
                window.dispatchEvent(
                  new CustomEvent("planbooq:switch-ticket-tab", {
                    detail: { ticketId, tab: "agent" },
                  }),
                );
                void triggerWorkflowRun(ticketId).catch(() => {});
                toast.success(
                  `Running ${enabledSteps.length} step${enabledSteps.length === 1 ? "" : "s"} in Agent`,
                );
              })
            }
            disabled={pending || enabledCount === 0}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run
          </Button>
        </div>
      </header>

      {confirmingReset && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <span>
            This deletes all {wf.steps.length} custom step{wf.steps.length === 1 ? "" : "s"} on this
            ticket and falls back to the project default. This cannot be undone.
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                start(async () => {
                  const r = await disableTicketWorkflowOverride(ticketId);
                  if (!r.ok) toast.error(r.error);
                  setConfirmingReset(false);
                  await refresh();
                })
              }
              disabled={pending}
            >
              Delete custom steps
            </Button>
          </div>
        </div>
      )}

      {wf.hasOverride && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 text-[12px] text-amber-700 dark:text-amber-300">
          This ticket uses a custom copy of its workflow steps. Changes to the project's default
          template won't apply here — use Reset to drop back to the default.
        </div>
      )}

      {editable ? (
        <StepList
          steps={wf.steps.map((s) => ({
            id: s.id as string,
            name: s.name,
            prompt: s.prompt,
            position: s.position,
            enabled: s.enabled,
          }))}
          onAdd={async (name, prompt) => {
            const r = await addTicketStep({ ticketId, name, prompt });
            if (!r.ok) {
              toast.error(r.error);
              return false;
            }
            await refresh();
            return true;
          }}
          onUpdate={async (id, patch) => {
            const r = await updateTicketStep({ id, ...patch });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            await refresh();
          }}
          onRemove={async (id) => {
            const r = await removeTicketStep(id);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            await refresh();
          }}
          onReorder={async (orderedStepIds) => {
            const r = await reorderTicketSteps({ ticketId, orderedStepIds });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            await refresh();
          }}
        />
      ) : wf.steps.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No project-level default workflow set yet. Click Customize to define steps just for this
          ticket, or set a default in Settings → Workflows and pick it for this project.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {wf.steps.map((s, i) => (
            <ReadOnlyStepRow key={`${s.position}-${s.name}`} step={s} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadOnlyStepRow({
  step,
  index,
}: {
  step: { name: string; prompt: string; enabled: boolean };
  index: number;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={`flex flex-col gap-1 rounded-md border bg-background px-3 py-2 text-sm ${
        step.enabled ? "" : "opacity-60"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 text-left"
      >
        <span className="w-6 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
        <span className="flex-1 truncate">{step.name}</span>
        {!step.enabled && <span className="text-xs text-muted-foreground">disabled</span>}
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[12px] text-muted-foreground">
          {step.prompt}
        </pre>
      )}
    </li>
  );
}

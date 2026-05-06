"use client";

import { Loader2, Play, RotateCcw, Settings2 } from "lucide-react";
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
            {enabledCount} step{enabledCount === 1 ? "" : "s"} will run
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
            >
              <Settings2 className="size-4" />
              Customize
            </Button>
          )}
          {wf.hasOverride && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!confirm("Drop the ticket override and use the project default?")) return;
                start(async () => {
                  const r = await disableTicketWorkflowOverride(ticketId);
                  if (!r.ok) toast.error(r.error);
                  await refresh();
                });
              }}
              disabled={pending}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={() =>
              start(async () => {
                const r = await triggerWorkflowRun(ticketId);
                if (!r.ok) {
                  toast.error(r.error === "no_steps" ? "Add at least one enabled step" : r.error);
                  return;
                }
                toast.success(`Workflow run queued (${r.stepCount} steps)`);
                await refresh();
              })
            }
            disabled={pending || enabledCount === 0}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run
          </Button>
        </div>
      </header>

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
            <li
              key={`${s.position}-${s.name}`}
              className={`flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm ${
                s.enabled ? "" : "opacity-50"
              }`}
            >
              <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 truncate">{s.name}</span>
              {!s.enabled && <span className="text-xs text-muted-foreground">disabled</span>}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

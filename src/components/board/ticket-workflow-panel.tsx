"use client";

import { ChevronDown, Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { getProjectLocalPath } from "@/actions/project";
import {
  addTicketStep,
  applyWorkflowStatusSuggestion,
  disableTicketWorkflowOverride,
  getTicketWorkflow,
  getWorkflowStatusContext,
  listWorkflowTemplates,
  logWorkflowActivity,
  removeTicketStep,
  reorderTicketSteps,
  setTicketWorkflowFromTemplate,
  triggerWorkflowRun,
  updateTicketStep,
} from "@/actions/workflow";
import { getDesktopBridge } from "@/lib/use-is-desktop";
import { StepList } from "@/components/settings/workflows-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

type TemplateRow = { id: string; name: string; description: string | null; stepCount: number };

export function TicketWorkflowPanel({
  ticketId,
  workspaceId,
  projectId,
}: {
  ticketId: string;
  workspaceId: string;
  projectId: string;
}): React.ReactElement {
  const [wf, setWf] = useState<WorkflowState | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [hasLocalPath, setHasLocalPath] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [pending, start] = useTransition();
  // FIFO of step names we've dispatched but not yet logged as completed.
  const pendingStepsRef = useRef<string[]>([]);
  const wasRunningRef = useRef<boolean>(false);

  useEffect(() => {
    const onBusy = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ticketId?: string; running?: boolean };
      if (detail?.ticketId !== ticketId) return;
      const next = !!detail.running;
      // Falling edge: agent just went idle. If we have a pending step, that
      // step finished — log completion and, if more queued, start the next.
      if (wasRunningRef.current && !next && pendingStepsRef.current.length > 0) {
        const finished = pendingStepsRef.current.shift()!;
        void logWorkflowActivity({
          ticketId,
          text: `Workflow step completed: ${finished}`,
        }).catch(() => {});
        const upcoming = pendingStepsRef.current[0];
        if (upcoming) {
          void logWorkflowActivity({
            ticketId,
            text: `Workflow step started: ${upcoming}`,
          }).catch(() => {});
        }
      }
      wasRunningRef.current = next;
      setRunning(next);
    };
    window.addEventListener("planbooq:agent-busy", onBusy);
    return () => window.removeEventListener("planbooq:agent-busy", onBusy);
  }, [ticketId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await getProjectLocalPath(projectId);
      if (cancelled) return;
      setHasLocalPath(r.ok && !!r.localPath);
    })();
    const onChanged = () => {
      void (async () => {
        const r = await getProjectLocalPath(projectId);
        setHasLocalPath(r.ok && !!r.localPath);
      })();
    };
    window.addEventListener("planbooq:project-local-path-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("planbooq:project-local-path-changed", onChanged);
    };
  }, [projectId]);

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
    const t = await listWorkflowTemplates({ workspaceId });
    if (t.ok) setTemplates(t.templates);
  }

  useEffect(() => {
    refresh();
  }, [ticketId]);

  function runPrompts(prompts: string[]) {
    if (prompts.length === 0) return;
    window.dispatchEvent(
      new CustomEvent("planbooq:workflow-run", {
        detail: { ticketId, prompts },
      }),
    );
    // Move the ticket to Running (deterministic backlog|todo → building)
    // immediately so the card jumps columns the moment the user clicks Run.
    // Then ask local Claude Code in the background for a smarter status pick
    // and apply it as a refinement if it differs.
    void (async () => {
      try {
        await triggerWorkflowRun(ticketId);
      } catch {
        // tolerated
      }
    })();
    void (async () => {
      try {
        const bridge = getDesktopBridge();
        if (!bridge?.agentOneshot) return;
        const ctxRes = await getWorkflowStatusContext(ticketId);
        if (!ctxRes.ok || ctxRes.statuses.length === 0) return;
        const allowed = ctxRes.statuses.map((s) => s.key);
        const stepsBlock = prompts
          .map((p, i) => `${i + 1}. ${p.slice(0, 400)}`)
          .join("\n");
        const askPrompt = [
          "You are picking the kanban status for a ticket whose workflow steps are about to run via Claude Code.",
          "Common status keys: backlog (not started), todo (planned), building (in progress), blocked (agent is awaiting user input/decision), review (PR open), completed (done).",
          'Reply with strict JSON only: {"statusKey":"<one of allowed>","reason":"short"}. No prose, no fences.',
          "",
          `Allowed status keys: ${allowed.join(", ")}`,
          `Current status: ${ctxRes.currentStatusKey || "(unknown)"}`,
          `Ticket title: ${ctxRes.title}`,
          ctxRes.description ? `Ticket description:\n${ctxRes.description}` : "",
          "Workflow steps about to run:",
          stepsBlock,
        ]
          .filter(Boolean)
          .join("\n");
        const res = await bridge.agentOneshot({
          prompt: askPrompt,
          timeoutMs: 15_000,
        });
        if (!res.ok || !res.text) return;
        const stripped = res.text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        let suggestedStatusKey: string | undefined;
        try {
          const parsed = JSON.parse(stripped) as { statusKey?: unknown };
          if (typeof parsed.statusKey === "string" && allowed.includes(parsed.statusKey)) {
            suggestedStatusKey = parsed.statusKey;
          }
        } catch {
          // unparseable — keep the deterministic move
        }
        if (suggestedStatusKey) {
          await applyWorkflowStatusSuggestion(ticketId, suggestedStatusKey);
        }
      } catch {
        // tolerated
      }
    })();
  }

  function logStarted(name: string) {
    void logWorkflowActivity({
      ticketId,
      text: `Workflow step started: ${name}`,
    }).catch(() => {});
  }

  function runStep(step: { name: string; prompt: string }) {
    if (!hasLocalPath) {
      toast.error("Choose this project's folder first");
      return;
    }
    const queueWasEmpty = pendingStepsRef.current.length === 0;
    pendingStepsRef.current.push(step.name);
    if (queueWasEmpty) logStarted(step.name);
    runPrompts([`[Workflow: ${step.name}]\n${step.prompt}`]);
    toast.success(`Running step: ${step.name}`);
  }

  function runAll() {
    if (!wf) return;
    const enabled = wf.steps.filter((s) => s.enabled);
    if (enabled.length === 0) {
      if (!hasLocalPath) {
        toast.error("Choose this project's folder first");
        return;
      }
      const defaultName = "build";
      const shipLine = hasLocalPath
        ? "When the build is complete, follow the shipping steps in CLAUDE.local.md to open a PR (commit, push, gh pr create, then ./.planbooq/pbq ship)."
        : "";
      const defaultPrompt = [
        "[Workflow 1/1: build]",
        "No workflow steps are configured for this ticket. Build the project to satisfy the ticket's title and description.",
        shipLine,
      ]
        .filter(Boolean)
        .join("\n");
      const queueWasEmpty = pendingStepsRef.current.length === 0;
      pendingStepsRef.current.push(defaultName);
      if (queueWasEmpty) logStarted(defaultName);
      runPrompts([defaultPrompt]);
      toast.success("Running default build");
      return;
    }
    const prompts = enabled.map(
      (s, i) => `[Workflow ${i + 1}/${enabled.length}: ${s.name}]\n${s.prompt}`,
    );
    const queueWasEmpty = pendingStepsRef.current.length === 0;
    for (const s of enabled) pendingStepsRef.current.push(s.name);
    if (queueWasEmpty && enabled[0]) logStarted(enabled[0].name);
    runPrompts(prompts);
    toast.success(`Running ${enabled.length} step${enabled.length === 1 ? "" : "s"}`);
  }

  if (!wf) {
    return <p className="text-sm text-muted-foreground">Loading workflow…</p>;
  }

  const enabledCount = wf.steps.filter((s) => s.enabled).length;
  const editable = wf.hasOverride || (!wf.templateId && wf.steps.length === 0);
  const currentLabel = wf.hasOverride
    ? "Custom workflow"
    : wf.templateName || "No workflow";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/60"
            >
              <span className="truncate text-sm font-medium">{currentLabel}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {enabledCount}/{wf.steps.length}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {templates.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No templates yet. Create one in Settings → Workflows.
              </div>
            )}
            {templates.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={() =>
                  start(async () => {
                    const r = await setTicketWorkflowFromTemplate({
                      ticketId,
                      templateId: t.id,
                    });
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    await refresh();
                  })
                }
              >
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {t.stepCount}
                </span>
              </DropdownMenuItem>
            ))}
            {wf.hasOverride && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    start(async () => {
                      const r = await disableTicketWorkflowOverride(ticketId);
                      if (!r.ok) toast.error(r.error);
                      await refresh();
                    })
                  }
                >
                  <span className="text-muted-foreground">Reset to project default</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          onClick={runAll}
          disabled={pending || running}
        >
          {pending || running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {running ? "Running…" : "Execute"}
        </Button>
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
          onRunStep={(s) => runStep(s)}
        />
      ) : wf.steps.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No workflow set yet. Pick a template above, or set a project default in Settings →
          Workflows.
        </p>
      ) : (
        <ul className="flex flex-col">
          {wf.steps.map((s, i) => (
            <ReadOnlyStepRow
              key={`${s.position}-${s.name}`}
              step={s}
              index={i}
              onRun={() => runStep(s)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadOnlyStepRow({
  step,
  index,
  onRun,
}: {
  step: { name: string; prompt: string; enabled: boolean };
  index: number;
  onRun: () => void;
}): React.ReactElement {
  return (
    <li
      className={`group flex items-center gap-2 border-b border-border/40 py-1.5 text-sm last:border-b-0 ${
        step.enabled ? "" : "opacity-60"
      }`}
    >
      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">
        {index + 1}.
      </span>
      <span className="flex-1 truncate">{step.name}</span>
      {!step.enabled && <span className="text-[11px] text-muted-foreground">disabled</span>}
      <button
        type="button"
        onClick={onRun}
        disabled={!step.enabled}
        aria-label="Run this step"
        title="Run this step"
        className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
      >
        <Play className="size-3.5" />
      </button>
    </li>
  );
}

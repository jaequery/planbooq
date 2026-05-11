"use client";

import { Check, ChevronDown, Loader2, Play, Plus } from "lucide-react";
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
  agentLive: boolean;
  steps: Array<{
    id: string | null;
    name: string;
    prompt: string;
    position: number;
    enabled: boolean;
    source: "ticket" | "template";
    completed: boolean | null;
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
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  function statusFor(name: string): "pending" | "running" | "completed" {
    // Server-derived completion (from prUrl, AgentJobs, TicketActivity) is
    // authoritative when a real signal exists. Falls through to the
    // client-side FIFO heuristic only for steps the server can't classify.
    const step = wf?.steps.find((s) => s.name === name);
    if (step?.completed === true) return "completed";
    if (step?.completed === false) {
      // Server explicitly says not done — only a live "running" indicator
      // can override. Don't trust stale local state.
      if (currentStep === name && running) return "running";
      return "pending";
    }
    if (currentStep === name && running) return "running";
    if (completedSteps.has(name)) return "completed";
    return "pending";
  }

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
        setCompletedSteps((prev) => {
          const out = new Set(prev);
          out.add(finished);
          return out;
        });
        const upcoming = pendingStepsRef.current[0];
        setCurrentStep(upcoming ?? null);
        if (upcoming) {
          void logWorkflowActivity({
            ticketId,
            text: `Workflow step started: ${upcoming}`,
          }).catch(() => {});
        }
      }
      wasRunningRef.current = next;
      setRunning(next);
      // On falling edge, refetch so the server-derived `completed` per step
      // catches up with whatever the agent just changed (prUrl, build job,
      // test activity). The FIFO heuristic is now strictly fallback.
      if (!next) {
        void refresh();
      }
    };
    window.addEventListener("planbooq:agent-busy", onBusy);
    return () => window.removeEventListener("planbooq:agent-busy", onBusy);
    // refresh is stable enough — declared in this same component scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        agentLive: a.agentLive,
        steps: a.steps,
      });
      // Server is the source of truth for whether the agent is actually
      // working. If it says no live job, clear any stale client `running`
      // state — the agent-busy falling-edge event may never have fired
      // (panel unmounted, bridge crashed, Claude killed externally) and
      // without this we'd stay disabled forever.
      if (!a.agentLive) {
        if (wasRunningRef.current) wasRunningRef.current = false;
        setRunning(false);
        setCurrentStep(null);
        pendingStepsRef.current = [];
      }
    }
    const t = await listWorkflowTemplates({ workspaceId });
    if (t.ok) setTemplates(t.templates);
  }

  useEffect(() => {
    refresh();
  }, [ticketId]);

  // While we believe the agent is running, poll the server every 30s so
  // server-side reconciliation (stale-job sweep) gets exercised even when
  // no client event arrives. The poll stops as soon as the server reports
  // agentLive=false (refresh() clears `running` in that case).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, ticketId]);

  // Refetch when the board reports a ticket.updated/moved for this ticket —
  // the payload may include a new prUrl or a status change that flips steps
  // to completed (review/completed status implies all preceding steps done).
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ticketId?: string };
      if (detail?.ticketId !== ticketId) return;
      void refresh();
    };
    const onFocus = () => {
      // Browser tabs throttle background ably traffic; on refocus, force a
      // re-derive so the panel is never strictly older than the DB.
      void refresh();
    };
    window.addEventListener("planbooq:ticket-updated", onUpdated);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("planbooq:ticket-updated", onUpdated);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCompletedSteps((prev) => {
      if (!prev.has(step.name)) return prev;
      const out = new Set(prev);
      out.delete(step.name);
      return out;
    });
    if (queueWasEmpty) {
      setCurrentStep(step.name);
      logStarted(step.name);
    }
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
        ? "When the build is complete, follow the shipping steps in PLANBOOQ.md to open a PR (commit, push, gh pr create, then ./.planbooq/pbq ship)."
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
      if (queueWasEmpty) {
        setCurrentStep(defaultName);
        logStarted(defaultName);
      }
      runPrompts([defaultPrompt]);
      toast.success("Running default build");
      return;
    }
    const prompts = enabled.map(
      (s, i) => `[Workflow ${i + 1}/${enabled.length}: ${s.name}]\n${s.prompt}`,
    );
    const queueWasEmpty = pendingStepsRef.current.length === 0;
    for (const s of enabled) pendingStepsRef.current.push(s.name);
    setCompletedSteps((prev) => {
      if (prev.size === 0) return prev;
      const out = new Set(prev);
      for (const s of enabled) out.delete(s.name);
      return out;
    });
    if (queueWasEmpty && enabled[0]) {
      setCurrentStep(enabled[0].name);
      logStarted(enabled[0].name);
    }
    runPrompts(prompts);
    toast.success(`Running ${enabled.length} step${enabled.length === 1 ? "" : "s"}`);
  }

  if (!wf) {
    return <p className="text-sm text-muted-foreground">Loading workflow…</p>;
  }

  const enabledCount = wf.steps.filter((s) => s.enabled).length;
  const editable = wf.hasOverride;
  const currentLabel = wf.hasOverride
    ? "Workflow"
    : wf.templateName || "Choose workflow";

  function pickTemplate(templateId: string) {
    start(async () => {
      const r = await setTicketWorkflowFromTemplate({ ticketId, templateId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded text-left text-muted-foreground hover:text-foreground"
            >
              <span className="truncate text-xs">{currentLabel}</span>
              {wf.steps.length > 0 && (
                <span className="shrink-0 text-[11px] text-muted-foreground/60">
                  {enabledCount}/{wf.steps.length}
                </span>
              )}
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {templates.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No templates yet. Create one in Settings → Workflows.
              </div>
            )}
            {templates.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => pickTemplate(t.id)}>
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
        <button
          type="button"
          onClick={runAll}
          disabled={pending || running}
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending || running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          <span>{running ? "Running" : "Run"}</span>
        </button>
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
          stepStatus={(s) => statusFor(s.name)}
        />
      ) : wf.steps.length === 0 ? (
        <>
          <p className="text-xs text-muted-foreground/70">
            Pick a template above, or set a project default in Settings → Workflows.
          </p>
          <AddStepInline
            disabled={pending}
            onAdd={async (name) => {
              if (wf.templateId) {
                const r = await setTicketWorkflowFromTemplate({
                  ticketId,
                  templateId: wf.templateId,
                });
                if (!r.ok) {
                  toast.error(r.error);
                  return false;
                }
              }
              const r = await addTicketStep({
                ticketId,
                name,
                prompt: "Describe what this step should do.",
              });
              if (!r.ok) {
                toast.error(r.error);
                return false;
              }
              await refresh();
              return true;
            }}
          />
        </>
      ) : (
        <>
          <ul className="flex flex-col">
            {wf.steps.map((s, i) => (
              <ReadOnlyStepRow
                key={`${s.position}-${s.name}`}
                step={s}
                index={i}
                onRun={() => runStep(s)}
                status={statusFor(s.name)}
              />
            ))}
          </ul>
          <AddStepInline
            disabled={pending}
            withBorder
            onAdd={async (name) => {
              if (wf.templateId) {
                const r = await setTicketWorkflowFromTemplate({
                  ticketId,
                  templateId: wf.templateId,
                });
                if (!r.ok) {
                  toast.error(r.error);
                  return false;
                }
              }
              const r = await addTicketStep({
                ticketId,
                name,
                prompt: "Describe what this step should do.",
              });
              if (!r.ok) {
                toast.error(r.error);
                return false;
              }
              await refresh();
              return true;
            }}
          />
        </>
      )}
    </div>
  );
}

function ReadOnlyStepRow({
  step,
  index,
  onRun,
  status,
}: {
  step: { name: string; prompt: string; enabled: boolean };
  index: number;
  onRun: () => void;
  status: "pending" | "running" | "completed";
}): React.ReactElement {
  return (
    <li
      className={`group flex items-center gap-2 border-b border-border/40 py-1.5 text-sm last:border-b-0 ${
        step.enabled ? "" : "opacity-60"
      }`}
    >
      <span
        className="flex w-5 shrink-0 items-center justify-end text-[11px] tabular-nums text-muted-foreground/60"
        aria-label={`Step ${status}`}
        title={status === "completed" ? "Completed" : status === "running" ? "Running" : "Pending"}
      >
        {status === "completed" ? (
          <Check className="size-3.5 text-emerald-500/80" aria-hidden />
        ) : status === "running" ? (
          <Loader2 className="size-3.5 animate-spin text-foreground/70" aria-hidden />
        ) : (
          <>{index + 1}.</>
        )}
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

function AddStepInline({
  onAdd,
  disabled,
  withBorder,
}: {
  onAdd: (name: string) => Promise<boolean>;
  disabled?: boolean;
  withBorder?: boolean;
}): React.ReactElement {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function submit() {
    const n = value.trim();
    if (!n) {
      setAdding(false);
      return;
    }
    start(async () => {
      const ok = await onAdd(n);
      if (ok) {
        setValue("");
        setAdding(false);
      }
    });
  }

  return (
    <div
      className={`flex items-center gap-2 py-1.5 ${withBorder ? "border-t border-border/40" : ""}`}
    >
      {adding ? (
        <>
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/40">
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setValue("");
                setAdding(false);
              }
            }}
            onBlur={submit}
            placeholder="Step name"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={disabled || pending}
          className="-ml-1 flex h-7 items-center gap-1.5 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="size-3.5" />
          Add Step
        </button>
      )}
    </div>
  );
}

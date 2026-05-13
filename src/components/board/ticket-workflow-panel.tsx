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
  removeTicketStep,
  reorderTicketSteps,
  setTicketWorkflowFromTemplate,
  triggerWorkflowRun,
  updateTicketStep,
} from "@/actions/workflow";
import { StepList } from "@/components/settings/workflows-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDesktopBridge } from "@/lib/use-is-desktop";

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
  autoRun,
  agentReady,
  onReady,
}: {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  autoRun?: boolean;
  /** True once the sibling agent panel has loaded its own project-local-path
   *  state and is wired to receive server-authored workflow dispatch events. */
  agentReady?: boolean;
  onReady?: () => void;
}): React.ReactElement | null {
  const [wf, setWf] = useState<WorkflowState | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [hasLocalPath, setHasLocalPath] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [pending, start] = useTransition();
  // FIFO of step names we've dispatched but not yet logged as completed.
  // This is now a pure UI hint; authoritative progression lives in
  // WorkflowStepRun rows server-side and the Inngest chaining function.
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
      // Falling edge: agent just went idle. If we have a local running hint,
      // clear it and let the server-authored WorkflowStepRun/activity state
      // catch up on refresh.
      if (wasRunningRef.current && !next && pendingStepsRef.current.length > 0) {
        const finished = pendingStepsRef.current.shift();
        if (finished) {
          setCompletedSteps((prev) => {
            const out = new Set(prev);
            out.add(finished);
            return out;
          });
        }
        setCurrentStep(null);
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
        // NOTE: previously this also wiped pendingStepsRef / currentStep
        // after an 8s grace window. That was destructive — once a workflow
        // step's prompt was in flight on a slow Claude turn (or the
        // dialog re-mounted on a tab refresh), the next falling-edge
        // handler would short-circuit on an empty queue and silently drop
        // "Step completed: X" + "Step started: X+1" rows. The activity
        // gap on PLAN-RIF1NL was a direct symptom. Server-side
        // WorkflowRun/WorkflowStepRun rows are now the authoritative
        // progression record; the local queue is purely a UI hint and
        // is allowed to stay populated even across `agentLive=false`
        // dips. The dialog-re-mount case clears state via the unmount
        // effect that already nulls the refs at line ~71-73.
      }
    }
    onReady?.();
    const t = await listWorkflowTemplates({ workspaceId });
    if (t.ok) setTemplates(t.templates);
  }

  useEffect(() => {
    refresh();
  }, [ticketId]);

  // Auto-run guard: fire runAll() exactly once per ticket when the panel
  // mounts with autoRun=true and the workflow data has loaded. Triggered
  // by the chat-orb's auto-run path (server publishes ticket.workflow.run
  // → board opens this dialog with autoRunAction=true).
  //
  // `agentReady` gates on the sibling agent panel finishing its own
  // getProjectLocalPath fetch. The server now publishes the actual workflow
  // dispatch event, but the agent panel still needs to be mounted and ready
  // to consume that event.
  const autoRunFiredRef = useRef(false);
  useEffect(() => {
    if (!autoRun) return;
    if (!agentReady) return;
    if (autoRunFiredRef.current) return;
    if (!wf) return;
    if (!hasLocalPath) return;
    if (running) return;
    autoRunFiredRef.current = true;
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, agentReady, wf, hasLocalPath, running]);

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

  async function runPrompts(steps: Array<{ name: string; prompt: string }>) {
    if (steps.length === 0) return;
    // The server creates the WorkflowRun, marks the first step as started,
    // writes STEP_STARTED activity, and publishes ticket.workflow.dispatch.
    try {
      await triggerWorkflowRun(ticketId, {
        steps: steps.map((s) => ({ name: s.name, prompt: s.prompt })),
      });
    } catch {
      // tolerated — status refinement below is best-effort too
    }
    // Ask local Claude Code in the background for a smarter status pick than
    // the deterministic backlog|todo → building that triggerWorkflowRun
    // already applied, and refine if it differs.
    void (async () => {
      try {
        const bridge = getDesktopBridge();
        if (!bridge?.agentOneshot) return;
        const ctxRes = await getWorkflowStatusContext(ticketId);
        if (!ctxRes.ok || ctxRes.statuses.length === 0) return;
        const allowed = ctxRes.statuses.map((s) => s.key);
        const stepsBlock = steps.map((s, i) => `${i + 1}. ${s.prompt.slice(0, 400)}`).join("\n");
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

  function runStep(step: { name: string; prompt: string }) {
    if (!hasLocalPath) {
      toast.error("Choose this project's folder first");
      return;
    }
    pendingStepsRef.current = [step.name];
    setCompletedSteps((prev) => {
      if (!prev.has(step.name)) return prev;
      const out = new Set(prev);
      out.delete(step.name);
      return out;
    });
    setCurrentStep(step.name);
    void runPrompts([{ name: step.name, prompt: `[Workflow: ${step.name}]\n${step.prompt}` }]);
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
      pendingStepsRef.current = [defaultName];
      setCurrentStep(defaultName);
      void runPrompts([{ name: defaultName, prompt: defaultPrompt }]);
      toast.success("Running default build");
      return;
    }
    const dispatch = enabled.map((s, i) => ({
      name: s.name,
      prompt: `[Workflow ${i + 1}/${enabled.length}: ${s.name}]\n${s.prompt}`,
    }));
    pendingStepsRef.current = enabled[0] ? [enabled[0].name] : [];
    setCompletedSteps((prev) => {
      if (prev.size === 0) return prev;
      const out = new Set(prev);
      for (const s of enabled) out.delete(s.name);
      return out;
    });
    if (enabled[0]) {
      setCurrentStep(enabled[0].name);
    }
    void runPrompts(dispatch);
    toast.success(`Running ${enabled.length} step${enabled.length === 1 ? "" : "s"}`);
  }

  if (!wf) {
    // Parent (TicketAgentPanel) renders the unified loading indicator while
    // workflow data is in flight. Rendering anything here would compete with
    // it and flash a half-loaded panel.
    return null;
  }

  const enabledCount = wf.steps.filter((s) => s.enabled).length;
  const currentLabel = wf.hasOverride ? "Workflow" : wf.templateName || "Choose workflow";

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

  // First mutation against a template-backed workflow forks the template
  // into a ticket-scoped override so edits don't silently rewrite the
  // shared template for every other ticket. `setTicketWorkflowFromTemplate`
  // preserves template order (workflow.ts:905-918), so we can map the
  // user's clicked-step (by its current index in `wf.steps`) onto the new
  // ticket-scoped step.
  async function promoteToOverride(): Promise<WorkflowState | null> {
    if (!wf) return null;
    if (wf.hasOverride) return wf;
    if (!wf.templateId) return null;
    const r = await setTicketWorkflowFromTemplate({
      ticketId,
      templateId: wf.templateId,
    });
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    const fresh = await getTicketWorkflow(ticketId);
    if (!fresh.ok) return null;
    const next: WorkflowState = {
      hasOverride: fresh.hasOverride,
      templateId: fresh.templateId,
      templateName: fresh.templateName,
      agentLive: fresh.agentLive,
      steps: fresh.steps,
    };
    setWf(next);
    return next;
  }

  async function handleAdd(name: string, prompt: string): Promise<boolean> {
    if (!wf) return false;
    if (!wf.hasOverride) {
      const promoted = await promoteToOverride();
      // Promotion succeeds with no template too (no-op) — only fail-out
      // if there *was* a template and the fork explicitly failed.
      if (!promoted && wf.templateId) return false;
    }
    const r = await addTicketStep({ ticketId, name, prompt });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    await refresh();
    return true;
  }

  async function handleUpdate(
    id: string,
    patch: { name?: string; prompt?: string; enabled?: boolean },
  ): Promise<void> {
    if (!wf) return;
    let targetId = id;
    if (!wf.hasOverride) {
      const idx = wf.steps.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const promoted = await promoteToOverride();
      if (!promoted) return;
      const newId = promoted.steps[idx]?.id;
      if (!newId) return;
      targetId = newId;
    }
    const r = await updateTicketStep({ id: targetId, ...patch });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    await refresh();
  }

  async function handleRemove(id: string): Promise<void> {
    if (!wf) return;
    let targetId = id;
    if (!wf.hasOverride) {
      const idx = wf.steps.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const promoted = await promoteToOverride();
      if (!promoted) return;
      const newId = promoted.steps[idx]?.id;
      if (!newId) return;
      targetId = newId;
    }
    const r = await removeTicketStep(targetId);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    await refresh();
  }

  async function handleReorder(orderedStepIds: string[]): Promise<void> {
    if (!wf) return;
    let nextIds = orderedStepIds;
    if (!wf.hasOverride) {
      const indexes = orderedStepIds.map((sid) => wf.steps.findIndex((s) => s.id === sid));
      if (indexes.some((i) => i < 0)) return;
      const promoted = await promoteToOverride();
      if (!promoted) return;
      const mapped = indexes.map((i) => promoted.steps[i]?.id);
      if (mapped.some((v) => !v)) return;
      nextIds = mapped as string[];
    }
    const r = await reorderTicketSteps({ ticketId, orderedStepIds: nextIds });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    await refresh();
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
                <span className="ml-auto text-[11px] text-muted-foreground">{t.stepCount}</span>
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

      {!wf.hasOverride && wf.steps.length === 0 && (
        <p className="text-xs text-muted-foreground/70">
          Pick a template above, or set a project default in Settings → Workflows.
        </p>
      )}
      <StepList
        steps={wf.steps.map((s) => ({
          id: s.id as string,
          name: s.name,
          prompt: s.prompt,
          position: s.position,
          enabled: s.enabled,
        }))}
        onAdd={(name, prompt) => handleAdd(name, prompt)}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
        onReorder={handleReorder}
        onRunStep={(s) => runStep(s)}
        stepStatus={(s) => statusFor(s.name)}
      />
    </div>
  );
}

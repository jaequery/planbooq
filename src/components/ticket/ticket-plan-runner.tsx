"use client";

import { Loader2, Play, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mintAgentApiKey } from "@/actions/api-keys";
import { getProjectLocalPath } from "@/actions/project";
import { executeTicket, executeTicketDesktop } from "@/actions/ticket-llm";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { registerAgentSession } from "@/lib/agent-session-manager";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import { getDesktopBridge, useIsDesktop } from "@/lib/use-is-desktop";

type Mode = "plan" | "execute" | null;

type Props = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  identifier: string;
  statusKey: string | undefined;
  /** When set true the runner auto-fires its action once on mount. */
  autoRun?: boolean;
};

type HydratedJob = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  output: string;
};

function modeForStatus(statusKey: string | undefined): Mode {
  if (statusKey === "backlog") return "plan";
  if (statusKey === "todo") return "execute";
  return null;
}

export function TicketPlanRunner({
  ticketId,
  workspaceId,
  projectId,
  title,
  description,
  identifier,
  statusKey,
  autoRun,
}: Props): React.ReactElement | null {
  const isDesktop = useIsDesktop();
  const mode = modeForStatus(statusKey);
  const [streamed, setStreamed] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const firedRef = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  jobIdRef.current = jobId;
  // While we're consuming the POST stream directly, ignore Ably appendOutput
  // for that same jobId to avoid double-appending. Status events still apply.
  const ownStreamRef = useRef(false);

  // Hydrate from server: pull the most recent PLAN job for this ticket so
  // closing/reopening shows partial output and resumes streaming if RUNNING.
  useEffect(() => {
    if (mode !== "plan") return;
    let cancelled = false;
    setStreamed("");
    setJobId(null);
    setBusy(false);
    void (async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/desktop-jobs?kind=PLAN`, {
          cache: "no-store",
        });
        const body = (await res.json()) as { ok: boolean; data: HydratedJob | null };
        if (cancelled || !body.ok || !body.data) return;
        setStreamed(body.data.output);
        setJobId(body.data.id);
        if (body.data.status === "RUNNING") setBusy(true);
      } catch {
        // ignore — empty hydrate
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, mode]);

  // Subscribe to live deltas for the current ticket's PLAN job. This is what
  // keeps the panel streaming after a refresh, when the original POST stream
  // is owned by a different request.
  useBoardChannel(workspaceId, (event) => {
    if (event.name !== "agent.delta") return;
    if (event.ticketId !== ticketId || event.kind !== "PLAN") return;
    const id = jobIdRef.current;
    if (id && event.jobId !== id) return;
    if (!id) setJobId(event.jobId);
    if (event.appendOutput && !ownStreamRef.current) {
      setStreamed((prev) => prev + event.appendOutput);
      setBusy(true);
    }
    if (event.status === "SUCCEEDED" || event.status === "FAILED" || event.status === "CANCELED") {
      setBusy(false);
    } else if (event.status === "RUNNING") {
      setBusy(true);
    }
  });

  const runPlan = useCallback(async (): Promise<void> => {
    setStreamed("");
    setBusy(true);
    setJobId(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/tickets/${ticketId}/plan`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        toast.error(text || `Plan failed (${res.status})`);
        setBusy(false);
        return;
      }
      const id = res.headers.get("X-Pbq-Job-Id");
      if (id) setJobId(id);
      ownStreamRef.current = true;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // The POST stream and the Ably fanout both emit the same chunks. We
        // only consume one to avoid double-appending. Use the POST stream
        // while this request is alive — it's the lower-latency path — and
        // suppress the Ably appends for our own jobId via the subscriber's
        // freshness check (it will still update busy/status from Ably).
        setStreamed((prev) => prev + decoder.decode(value, { stream: true }));
      }
      toast.success("Plan ready. Moved to Todo.");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(err instanceof Error ? err.message : "Plan failed");
      }
    } finally {
      abortRef.current = null;
      ownStreamRef.current = false;
      setBusy(false);
    }
  }, [ticketId]);

  const runExecute = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      // Desktop: spawn a real Claude Code session on the user's machine via
      // the bridge. The status move + comment happen server-side; the bridge
      // does the worktree + claude spawn; we register the session with the
      // global manager so output persists into the EXECUTE AgentJob row even
      // after the dialog closes and re-opens.
      if (isDesktop) {
        const bridge = getDesktopBridge();
        if (!bridge) {
          toast.error("Desktop bridge unavailable");
          return;
        }
        if (typeof bridge.agentStart !== "function") {
          toast.error("Desktop app is out of date — quit and relaunch Planbooq");
          return;
        }
        const repoRes = await getProjectLocalPath(projectId);
        if (!repoRes.ok || !repoRes.localPath) {
          toast.error("Pick a project folder first (open Agent panel → Choose Folder)");
          return;
        }
        const repoPath = repoRes.localPath;
        const prep = await executeTicketDesktop({ ticketId });
        if (!prep.ok) {
          toast.error(prep.error ?? "Execute failed");
          return;
        }
        const prompt = prep.data.prompt;
        // Open the AgentJob row up front so we have a jobId to register and
        // every subsequent stream chunk lands in it.
        let jobIdLocal: string | null = null;
        try {
          const r = await fetch(`/api/tickets/${ticketId}/desktop-jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, kind: "EXECUTE" }),
          });
          const body = (await r.json()) as { ok: boolean; data?: { jobId: string } };
          if (body.ok && body.data) jobIdLocal = body.data.jobId;
        } catch {
          // tolerated — local session still works, just won't persist.
        }
        let ticketCtx: Parameters<typeof bridge.agentStart>[0]["ticket"];
        try {
          const minted = await mintAgentApiKey({ workspaceId });
          if (minted.ok) {
            ticketCtx = {
              ticketId,
              identifier,
              title,
              apiBaseUrl: window.location.origin,
              apiToken: minted.data.token,
            };
          }
        } catch {}
        const branch = `pbq-${ticketId.slice(0, 8)}-${Date.now().toString(36)}`;
        try {
          const res = await bridge.agentStart({
            repoPath,
            branch,
            firstMessage: prompt,
            ticket: ticketCtx,
          });
          if (!res.ok || !res.sessionId) {
            toast.error(res.error ?? "Failed to start session");
            return;
          }
          if (jobIdLocal) {
            registerAgentSession(res.sessionId, {
              jobId: jobIdLocal,
              workspaceId,
              ticketId,
            });
            // Persist the worktree path so future panel hydrates can resume.
            void fetch(`/api/desktop-jobs/${jobIdLocal}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ worktreePath: res.worktreePath ?? null }),
            }).catch(() => undefined);
          }
          toast.success("Claude Code started. Moved to Building.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(msg);
        }
        return;
      }
      // Web fallback: dispatch to the paired remote agent.
      const res = await executeTicket({ ticketId });
      if (res.ok) {
        toast.success("Dispatched to agent. Moved to Building.");
      } else {
        const msg =
          res.error === "no_agent_paired"
            ? "No paired agent in this workspace. Pair one in Settings → Agents."
            : (res.error ?? "Execute failed");
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [isDesktop, projectId, ticketId, workspaceId, identifier, title]);

  const cancelPlan = useCallback(async (): Promise<void> => {
    // Abort the in-flight POST stream first so the UI stops appending
    // tokens immediately. Then PATCH the server so any other open client
    // (and the persisted job row) flips to CANCELED too.
    abortRef.current?.abort();
    abortRef.current = null;
    const id = jobIdRef.current;
    setBusy(false);
    if (!id) return;
    try {
      const res = await fetch(`/api/tickets/${ticketId}/jobs/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        toast.error(body.error ?? `Cancel failed (${res.status})`);
        return;
      }
      toast.success("Stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  }, [ticketId]);

  useEffect(() => {
    if (!autoRun || firedRef.current || !mode) return;
    firedRef.current = true;
    if (mode === "plan") void runPlan();
    else void runExecute();
  }, [autoRun, mode, runPlan, runExecute]);

  // Reset firedRef when ticket changes so a new auto-run can fire.
  useEffect(() => {
    firedRef.current = false;
  }, [ticketId]);

  if (!mode) return null;

  if (mode === "execute") {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[13px] font-medium">Ready to execute</div>
            <div className="text-[12px] text-muted-foreground">
              Dispatch this ticket to your paired Claude Code agent and move it to Building.
            </div>
          </div>
          <Button size="sm" onClick={runExecute} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Execute
          </Button>
        </div>
      </div>
    );
  }

  // plan mode
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[13px] font-medium">{streamed ? "Plan" : "Plan with Claude"}</div>
          <div className="text-[12px] text-muted-foreground">
            {busy
              ? "Drafting an implementation plan…"
              : streamed
                ? "Generated. Move to Todo to execute."
                : "Generate an implementation plan and move to Todo."}
          </div>
        </div>
        {busy ? (
          <Button size="sm" variant="outline" onClick={cancelPlan}>
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={runPlan}>
            <Sparkles className="size-3.5" />
            {streamed ? "Replan" : "Plan"}
          </Button>
        )}
      </div>
      {(streamed || busy) && (
        <div className="mt-3 max-h-[320px] overflow-y-auto rounded-md bg-background px-3 py-2">
          {streamed ? (
            <Markdown className="text-[13px]">{streamed}</Markdown>
          ) : (
            <div className="text-[12px] text-muted-foreground">
              <Loader2 className="inline size-3 animate-spin" /> thinking…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

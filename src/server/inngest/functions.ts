import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inferTicketPriority, runOpenRouterForTicket } from "@/server/openrouter";
import { mirrorJobTerminal } from "@/server/services/mirror-agent-job";
import { reconcileBuildingTicket } from "@/server/services/ticket-status";
import { shouldAutoChainAfterStep, workflowCommander } from "@/server/services/workflow-commander";

import { inngest } from "./client";

type TicketCreatedPayload = {
  ticketId: string;
  workspaceId: string;
};

export const ticketCreated = inngest.createFunction(
  {
    id: "ticket-created",
    name: "Ticket created",
    triggers: [{ event: "ticket/created" }],
  },
  async ({ event, step }) => {
    const data = event.data as TicketCreatedPayload;

    await step.run("log-ticket-created", () => {
      logger.info("inngest.ticket.created", {
        ticketId: data.ticketId,
        workspaceId: data.workspaceId,
      });
      return { ok: true };
    });

    await step.run("auto-priority", async () => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: data.ticketId },
        select: {
          id: true,
          workspaceId: true,
          projectId: true,
          title: true,
          description: true,
          priority: true,
          archivedAt: true,
        },
      });
      if (!ticket || ticket.archivedAt) return { ran: false };
      if (ticket.priority !== "NO_PRIORITY") return { ran: false, reason: "already_set" };

      const project = await prisma.project.findUnique({
        where: { id: ticket.projectId },
        select: { description: true, techStack: true },
      });
      const projectContext =
        [project?.description, project?.techStack].filter(Boolean).join("\n\n") || null;

      const result = await inferTicketPriority({
        workspaceId: ticket.workspaceId,
        title: ticket.title,
        description: ticket.description,
        projectContext,
      });
      if (!result.ok) {
        logger.warn("autoPriority.failed", { ticketId: ticket.id, error: result.error });
        return { ran: true, ok: false };
      }
      if (result.priority === "NO_PRIORITY") return { ran: true, ok: true, skipped: true };

      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: { priority: result.priority },
        include: {
          assignee: { select: { id: true, name: true, email: true, image: true } },
          labels: { select: { id: true, name: true, color: true } },
          project: { select: { slug: true } },
        },
      });

      await publishWorkspaceEvent(ticket.workspaceId, {
        name: "ticket.updated",
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
        projectId: ticket.projectId,
        ticket: updated,
        by: "inngest:auto-priority",
      });

      logger.info("autoPriority.assigned", {
        ticketId: ticket.id,
        priority: result.priority,
        source: result.source,
      });
      return { ran: true, ok: true, priority: result.priority, source: result.source };
    });

    await step.run("maybe-run-openrouter", async () => {
      if (!process.env.OPENROUTER_API_KEY) return { ran: false };

      const ticket = await prisma.ticket.findUnique({
        where: { id: data.ticketId },
        select: { title: true, description: true },
      });
      if (!ticket) return { ran: false };

      const result = await runOpenRouterForTicket({
        ticketId: data.ticketId,
        workspaceId: data.workspaceId,
        title: ticket.title,
        description: ticket.description,
      });
      if (!result.ok) {
        logger.warn("openrouter.ticket.failed", {
          ticketId: data.ticketId,
          error: result.error,
        });
        return { ran: true, ok: false };
      }
      return { ran: true, ok: true };
    });

    return { ticketId: data.ticketId };
  },
);

/**
 * Server-side watchdog for stuck AgentJob rows. The renderer-side watchdog in
 * the ticket panel only runs while the ticket dialog is open — if the user
 * closes the dialog and the underlying `claude` child dies without flushing
 * an exit event, the row stays RUNNING forever. This sweeps every 5 min and
 * fails any RUNNING row whose `updatedAt` is older than STALE_AFTER_MS.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;
// Tickets stranded in `building` are a UX bug — reconcile aggressively. The
// reconcile itself bails when a sibling job is still RUNNING, so this is
// safe to run frequently against every building ticket.
const STRANDED_BUILDING_AFTER_MS = 3 * 60 * 1000;
// Targeted stale window for the "building ticket + RUNNING-but-dead AgentJob"
// case. Tighter than the global STALE_AFTER_MS because we only act on rows
// whose ticket is visibly stuck in `building` (Running) — the cost of false-
// positive killing a legitimately slow Claude run is bounded to a SYSTEM
// "no output" message and a Blocked move that the user can override.
//
// Combined with bridge heartbeats (agent-session-manager.ts pings every 30s
// while a session is alive), `updatedAt` reflects bridge-confirmed liveness,
// not just wire-event activity — so a job past this window is genuinely
// dead, not mid-tool-call. This is Planbooq's distributed analog of
// Paperclip's process.kill(pid, 0) reaper
// (~/Sites/paperclip/server/src/services/heartbeat.ts:6406).
const STRANDED_RUNNING_AFTER_MS = 2 * 60 * 1000;

export const reapStaleAgentJobs = inngest.createFunction(
  {
    id: "reap-stale-agent-jobs",
    name: "Reap stale AgentJob rows",
    triggers: [{ cron: "*/2 * * * *" }],
  },
  async ({ step }) => {
    const now = Date.now();
    const cutoff = new Date(now - STALE_AFTER_MS);
    const strandedCutoff = new Date(now - STRANDED_BUILDING_AFTER_MS);

    const stale = await step.run("find-stale", () =>
      prisma.agentJob.findMany({
        where: { status: "RUNNING", updatedAt: { lt: cutoff } },
        select: {
          id: true,
          workspaceId: true,
          ticketId: true,
          userId: true,
          agentId: true,
          kind: true,
        },
      }),
    );

    if (stale.length > 0) {
      await step.run("mark-failed", async () => {
        const now = new Date();
        await prisma.agentJob.updateMany({
          where: { id: { in: stale.map((j) => j.id) } },
          data: {
            status: "FAILED",
            finishedAt: now,
            error: `stalled: no events for >${Math.round(STALE_AFTER_MS / 60000)}m (server watchdog)`,
          },
        });
        logger.warn("agent.job.reaped", { count: stale.length, ids: stale.map((j) => j.id) });
      });

      // Fan out so any open panel re-hydrates with the FAILED status.
      await step.run("publish", async () => {
        for (const job of stale) {
          if (!job.workspaceId) continue;
          const kind = (job.kind as "PLAN" | "EXECUTE" | "CHAT") ?? "CHAT";
          await publishWorkspaceEvent(job.workspaceId, {
            name: "agent.delta",
            jobId: job.id,
            ticketId: job.ticketId,
            workspaceId: job.workspaceId,
            kind,
            status: "FAILED",
          });
        }
      });

      // Mirror the terminal status onto the paired Message so the conversation
      // thread doesn't keep showing a "running" spinner. Without this, the
      // AgentJob row flips to FAILED but its mirrored Message stays in
      // STREAMING/PENDING forever — visible in the rail as "System running".
      await step.run("mirror-reaped-messages", async () => {
        for (const job of stale) {
          await mirrorJobTerminal({
            job: {
              id: job.id,
              workspaceId: job.workspaceId,
              ticketId: job.ticketId,
              agentId: job.agentId,
              kind: job.kind,
            } as Parameters<typeof mirrorJobTerminal>[0]["job"],
            status: "FAILED",
            finalOutput: "",
          }).catch((error: unknown) => {
            logger.warn("agent.job.mirror.failed", {
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      });

      // Reconcile each affected ticket out of `building`.
      await step.run("reconcile-reaped-tickets", async () => {
        const seen = new Set<string>();
        for (const job of stale) {
          if (!job.ticketId || seen.has(job.ticketId)) continue;
          seen.add(job.ticketId);
          await reconcileBuildingTicket({
            ticketId: job.ticketId,
            byUserId: job.userId,
            excludeJobId: job.id,
            jobStatus: "FAILED",
          }).catch((error: unknown) => {
            logger.warn("ticket.reconcile.failed", {
              ticketId: job.ticketId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      });
    }

    // Targeted pass: tickets in `building` whose latest AgentJob is
    // *still RUNNING* but hasn't been touched in STRANDED_RUNNING_AFTER_MS.
    // The global stale sweep above uses a 10-minute threshold to protect
    // legitimately slow Claude operations across all job kinds; here we
    // narrow to "building" tickets and use a tighter 2-min window because:
    //   1) The user can SEE these tickets stuck on "Running" — UX cost is
    //      visible and ongoing.
    //   2) Bridge heartbeats (agent-session-manager.ts) bump `updatedAt`
    //      every 30s while a session is alive, so a 2-min gap means the
    //      bridge stopped reporting, not that Claude is mid-tool-call.
    //   3) Status-CAS in the reaping loop makes this idempotent under
    //      concurrent runs (parallel cron / parallel workflow watchdog).
    const strandedRunningCutoff = new Date(now - STRANDED_RUNNING_AFTER_MS);
    const strandedRunningJobs = await step.run("find-stranded-running", () =>
      prisma.agentJob.findMany({
        where: {
          status: "RUNNING",
          updatedAt: { lt: strandedRunningCutoff },
          ticket: { status: { key: "building" }, archivedAt: null },
        },
        select: {
          id: true,
          workspaceId: true,
          ticketId: true,
          userId: true,
          agentId: true,
          kind: true,
        },
        take: 200,
      }),
    );

    if (strandedRunningJobs.length > 0) {
      await step.run("reap-stranded-running", async () => {
        const reapedTicketIds = new Set<string>();
        for (const job of strandedRunningJobs) {
          // Status-CAS: a parallel reaper / workflow watchdog may have
          // already flipped this job; skip if we didn't win the race.
          const update = await prisma.agentJob.updateMany({
            where: { id: job.id, status: "RUNNING" },
            data: {
              status: "FAILED",
              finishedAt: new Date(),
              error: `stranded: no heartbeat for >${Math.round(STRANDED_RUNNING_AFTER_MS / 60000)}m (server watchdog)`,
            },
          });
          if (update.count === 0) continue;

          await mirrorJobTerminal({
            job: {
              id: job.id,
              workspaceId: job.workspaceId,
              ticketId: job.ticketId,
              agentId: job.agentId,
              kind: job.kind,
            } as Parameters<typeof mirrorJobTerminal>[0]["job"],
            status: "FAILED",
            finalOutput: "",
          }).catch((error: unknown) => {
            logger.warn("agent.job.mirror.failed", {
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });

          if (job.workspaceId) {
            await publishWorkspaceEvent(job.workspaceId, {
              name: "agent.delta",
              jobId: job.id,
              ticketId: job.ticketId,
              workspaceId: job.workspaceId,
              kind: (job.kind as "PLAN" | "EXECUTE" | "CHAT") ?? "CHAT",
              status: "FAILED",
            });
          }

          if (job.ticketId) reapedTicketIds.add(job.ticketId);
        }

        // Reconcile each affected ticket once (no liveSibling tripping —
        // all stale RUNNING siblings for the same ticket got marked FAILED
        // in the loop above).
        for (const ticketId of reapedTicketIds) {
          const sourceJob = strandedRunningJobs.find((j) => j.ticketId === ticketId);
          await reconcileBuildingTicket({
            ticketId,
            byUserId: sourceJob?.userId ?? null,
            jobStatus: "FAILED",
          }).catch((error: unknown) => {
            logger.warn("ticket.reconcile.failed", {
              ticketId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }

        logger.warn("agent.job.stranded-running.reaped", {
          count: strandedRunningJobs.length,
          ticketCount: reapedTicketIds.size,
        });
      });
    }

    // Belt-and-suspenders: tickets stranded in `building` whose latest
    // AgentJob is already terminal. This catches the original zombie path
    // where the renderer-side `decideEndOfRun` never fired (panel was
    // closed mid-run) but the underlying job actually completed cleanly.
    //
    // Filter on the latest AgentJob's `updatedAt`, NOT `ticket.updatedAt`:
    // a user editing the description / posting a comment bumps the ticket's
    // `updatedAt` and would otherwise indefinitely shield an actively-edited
    // ticket from reconciliation. We want the opposite — actively viewed
    // tickets are exactly where staleness is most visible.
    //
    // Tickets with no AgentJob at all (manually moved into building) also
    // qualify as stranded — they have no signal to ever leave.
    const stranded = await step.run("find-stranded-tickets", () =>
      prisma.ticket.findMany({
        where: {
          archivedAt: null,
          status: { key: "building" },
          OR: [
            { agentJobs: { none: {} } },
            {
              agentJobs: {
                every: {
                  status: { in: ["SUCCEEDED", "FAILED", "CANCELED"] },
                  updatedAt: { lt: strandedCutoff },
                },
              },
            },
          ],
        },
        select: { id: true, createdById: true },
        take: 200,
      }),
    );

    let strandedReconciled = 0;
    if (stranded.length > 0) {
      await step.run("reconcile-stranded-tickets", async () => {
        for (const t of stranded) {
          const r = await reconcileBuildingTicket({
            ticketId: t.id,
            byUserId: t.createdById,
          }).catch((error: unknown) => {
            logger.warn("ticket.reconcile.failed", {
              ticketId: t.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return { moved: null, reason: "error" };
          });
          if (r.moved) strandedReconciled += 1;
        }
      });
    }

    // Orphan-message sweep: any Message whose paired AgentJob is already
    // terminal but whose own status is still PENDING/STREAMING. This covers
    // paths that update AgentJob.status without going through the mirror —
    // e.g. the /api/tickets/[id]/plan finally-block throwing after the job
    // row was flipped but before mirrorJobTerminal ran, or any future call
    // site that forgets the mirror entirely.
    const orphans = await step.run("find-orphan-messages", () =>
      prisma.message.findMany({
        where: {
          status: { in: ["PENDING", "STREAMING"] },
          agentJobId: { not: null },
          agentJob: { status: { in: ["SUCCEEDED", "FAILED", "CANCELED"] } },
        },
        select: {
          id: true,
          agentJob: {
            select: {
              id: true,
              workspaceId: true,
              ticketId: true,
              agentId: true,
              kind: true,
              status: true,
              output: true,
            },
          },
        },
        take: 200,
      }),
    );

    if (orphans.length > 0) {
      await step.run("finalize-orphan-messages", async () => {
        for (const m of orphans) {
          const job = m.agentJob;
          if (!job) continue;
          const status = job.status as "SUCCEEDED" | "FAILED" | "CANCELED";
          await mirrorJobTerminal({
            job: {
              id: job.id,
              workspaceId: job.workspaceId,
              ticketId: job.ticketId,
              agentId: job.agentId,
              kind: job.kind,
            } as Parameters<typeof mirrorJobTerminal>[0]["job"],
            status,
            finalOutput: job.output ?? "",
          }).catch((error: unknown) => {
            logger.warn("message.orphan.finalize.failed", {
              messageId: m.id,
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
        logger.warn("message.orphans.finalized", { count: orphans.length });
      });
    }

    return {
      reaped: stale.length,
      strandedReconciled,
      orphansFinalized: orphans.length,
    };
  },
);

/**
 * Resolve a Vercel preview URL for a PR by walking GitHub's deployments API.
 * Vercel's GitHub integration registers deployments with environment "Preview"
 * keyed to the PR head SHA; the latest success status carries `environment_url`.
 * Returns null if anything is missing — caller falls back to the PR page.
 */
async function resolveVercelPreviewUrl(opts: {
  prUrl: string;
  userId: string;
}): Promise<string | null> {
  const m = opts.prUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  const [, owner, repo, prNumber] = m;

  const account = await prisma.account.findFirst({
    where: { userId: opts.userId, provider: "github" },
    select: { access_token: true },
  });
  const token = account?.access_token;
  if (!token) return null;

  const gh = async (path: string) => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) throw new Error(`gh ${path} ${res.status}`);
    return res.json() as Promise<unknown>;
  };

  const pr = (await gh(`/repos/${owner}/${repo}/pulls/${prNumber}`)) as {
    head?: { sha?: string };
  };
  const sha = pr.head?.sha;
  if (!sha) return null;

  const deployments = (await gh(
    `/repos/${owner}/${repo}/deployments?sha=${sha}&environment=Preview&per_page=20`,
  )) as Array<{ id: number; created_at: string }>;
  if (!Array.isArray(deployments) || deployments.length === 0) return null;
  // Newest first
  deployments.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  for (const dep of deployments) {
    const statuses = (await gh(
      `/repos/${owner}/${repo}/deployments/${dep.id}/statuses?per_page=20`,
    )) as Array<{ state: string; environment_url?: string; target_url?: string }>;
    const success = statuses.find(
      (s) => s.state === "success" && (s.environment_url || s.target_url),
    );
    if (success) return success.environment_url ?? success.target_url ?? null;
  }
  return null;
}

/**
 * Server-driven workflow step chaining. Triggered after a WorkflowStepRun
 * transitions to SUCCEEDED (see mirror-agent-job.ts `persistTurnEnd`).
 * Replaces the renderer-side `pendingStepsRef` queue, which evaporated on
 * dialog close / refresh / app crash — leaving steps like "Score it from A-F"
 * permanently unfired even though the workflow had more pending steps.
 *
 * Contract:
 *   - Loads the WorkflowRun for the just-completed step.
 *   - If the run is RUNNING and has another PENDING step (lowest position),
 *     publishes a `ticket.workflow.dispatch` Ably event carrying that step's
 *     prompt. The agent panel consumes it and dispatches via the existing
 *     desktop bridge `send()` path.
 *   - If no PENDING steps remain and all steps are SUCCEEDED, transitions
 *     the WorkflowRun to SUCCEEDED. A FAILED step short-circuits chaining
 *     (we don't auto-dispatch past a failure — the user should look first).
 *   - Does NOT transition the next step to RUNNING. That happens when the
 *     desktop-jobs POST route actually creates the AgentJob. Keeping the
 *     step in PENDING means a missed dispatch (bridge offline, dialog
 *     closed) is recoverable: the next user turn auto-binds to the
 *     PENDING step via the desktop-jobs auto-bind path.
 */
type WorkflowStepCompletedPayload = {
  stepRunId: string;
  workspaceId: string;
  ticketId: string;
};

export const workflowStepCompleted = inngest.createFunction(
  {
    id: "workflow-step-completed",
    name: "Workflow step completed — chain next",
    triggers: [{ event: "workflow/step.completed" }],
    // Single dispatch per step. Inngest retries are safe — publishing the
    // same dispatch event twice is dedup'd client-side by stepRunId latch.
    concurrency: { limit: 8 },
  },
  async ({ event, step }) => {
    const data = event.data as WorkflowStepCompletedPayload;

    const finished = await step.run("load-finished-step", () =>
      prisma.workflowStepRun.findUnique({
        where: { id: data.stepRunId },
        select: {
          id: true,
          runId: true,
          status: true,
          position: true,
          run: {
            select: {
              id: true,
              status: true,
              ticketId: true,
              workspaceId: true,
              stepRuns: {
                select: { id: true, name: true, prompt: true, position: true, status: true },
                orderBy: { position: "asc" },
              },
            },
          },
        },
      }),
    );
    if (!finished) return { ok: false, reason: "step_not_found" };
    if (finished.status !== "SUCCEEDED") return { ok: false, reason: "step_not_succeeded" };
    if (finished.run.status !== "RUNNING") return { ok: false, reason: "run_not_running" };

    // `dispatchNextStep` has two jobs: dispatch the next PENDING step OR (when
    // none remain) finalize the WorkflowRun to SUCCEEDED. We must always call
    // it when no PENDING steps are left, otherwise the run sits at RUNNING
    // forever (HOQTXA/N4THY7 zombie symptom).
    //
    // The auto-chain gate applies only to the "dispatch next" path: when
    // the finished step's `decision` isn't AUTO (or — pre-protocol — the
    // ticket lacks the `autonomous` label), we stop at Blocked between
    // steps and the human clicks Run to advance. This pairs with
    // persistTurnEnd's reconcile gate in mirror-agent-job.ts — both must
    // agree, or the demote-to-Blocked races the auto-dispatch and
    // SIGTERMs the warm session. Both halves read the same persisted
    // decision column, so they can't diverge.
    const pending = await step.run("count-pending", () =>
      prisma.workflowStepRun.count({
        where: { runId: finished.runId, status: "PENDING" },
      }),
    );
    if (pending > 0) {
      const auto = await step.run("check-auto-chain", () =>
        shouldAutoChainAfterStep({
          ticketId: finished.run.ticketId,
          runId: finished.runId,
          finishedStepRunId: finished.id,
        }),
      );
      if (!auto) {
        return { ok: true, reason: "auto_chain_disabled" };
      }
    }

    const dispatched = await step.run("dispatch-next-step", () =>
      workflowCommander.dispatchNextStep({ runId: finished.runId, byUserId: null }),
    );

    return {
      ok: true,
      reason: dispatched.dispatched ? "dispatched" : (dispatched.reason ?? "not-dispatched"),
      nextStepRunId: dispatched.stepRunId,
    };
  },
);

type ScreenshotsRequestedPayload = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  prUrl: string | null;
  /** PR's deployed preview URL, if known. Falls back to prUrl. */
  previewUrl?: string | null;
  requestedByUserId: string;
};

const SHOTS: Array<{ label: string; width: number; height: number }> = [
  { label: "Desktop", width: 1440, height: 900 },
  { label: "Tablet", width: 834, height: 1112 },
  { label: "Mobile", width: 390, height: 844 },
];

export const captureTicketScreenshots = inngest.createFunction(
  {
    id: "ticket-screenshots-capture",
    name: "Capture ticket screenshots",
    triggers: [{ event: "ticket.screenshots.requested" }],
    concurrency: { limit: 2 },
  },
  async ({ event, step }) => {
    const data = event.data as ScreenshotsRequestedPayload;
    const resolvedPreview = await step.run("resolve-vercel-preview", async () => {
      if (data.previewUrl) return data.previewUrl;
      if (!data.prUrl) return null;
      try {
        return await resolveVercelPreviewUrl({
          prUrl: data.prUrl,
          userId: data.requestedByUserId,
        });
      } catch (error) {
        logger.warn("vercel.preview.resolve.failed", {
          prUrl: data.prUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });
    const target = resolvedPreview ?? data.prUrl;

    const fail = async (reason: string) => {
      await publishWorkspaceEvent(data.workspaceId, {
        name: "ticket.screenshots.failed",
        workspaceId: data.workspaceId,
        ticketId: data.ticketId,
        reason,
      });
      return { ok: false, reason };
    };

    if (!target) return fail("no_preview_url");

    await step.run("publish-started", () =>
      publishWorkspaceEvent(data.workspaceId, {
        name: "ticket.screenshots.started",
        workspaceId: data.workspaceId,
        ticketId: data.ticketId,
        total: SHOTS.length,
        by: data.requestedByUserId,
      }),
    );

    // Retake semantics: clear existing previews so the new capture replaces
    // them rather than appending. Attachment rows are intentionally not
    // touched — they remain in storage if history is needed later.
    await step.run("clear-existing-previews", async () => {
      const existing = await prisma.ticketPreview.findMany({
        where: { ticketId: data.ticketId },
        select: { id: true },
      });
      if (existing.length === 0) return { cleared: 0 };
      await prisma.ticketPreview.deleteMany({ where: { ticketId: data.ticketId } });
      for (const p of existing) {
        await publishWorkspaceEvent(data.workspaceId, {
          name: "ticket.preview.removed",
          workspaceId: data.workspaceId,
          ticketId: data.ticketId,
          previewId: p.id,
          by: data.requestedByUserId,
        });
      }
      return { cleared: existing.length };
    });

    // Synthetic caller — the user who requested this run. addTicketPreviewSvc
    // re-checks workspace membership before writing.
    const caller = {
      userId: data.requestedByUserId,
      workspaceScope: null,
      via: "session" as const,
    };

    // Shell out to @playwright/cli — same browser session is reused across
    // viewports so we get one continuous video with chapter markers.
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");
    const run = promisify(execFile);

    const session = `pbq-${data.ticketId}`;
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), `pbq-shots-${data.ticketId}-`));
    const videoFile = path.join(outDir, "session.webm");
    const PCLI_BIN = path.join(process.cwd(), "node_modules", ".bin", "playwright-cli");
    // Force a short TMPDIR for the child: macOS caps Unix-domain socket paths
    // at 104 bytes, and the default `/var/folders/...` TMPDIR plus Playwright's
    // session sock filename overflows that limit, causing `listen EINVAL`.
    const pcliEnv = { ...process.env, TMPDIR: "/tmp/" };
    const pcli = (...args: string[]) =>
      run(PCLI_BIN, [`-s=${session}`, ...args], { timeout: 60_000, env: pcliEnv });

    try {
      await pcli("open", target);
      await pcli("video-start", videoFile);

      for (let i = 0; i < SHOTS.length; i += 1) {
        const shot = SHOTS[i]!;
        const shotPath = path.join(outDir, `${shot.label.toLowerCase()}.png`);

        const stepResult: { ok: boolean; error?: string } = await step.run(
          `shot-${shot.label}`,
          async () => {
            try {
              await pcli("resize", String(shot.width), String(shot.height));
              await pcli("video-chapter", shot.label);
              await pcli("goto", target);
              await pcli("screenshot", `--filename=${shotPath}`);
              const buf = await fs.readFile(shotPath);
              const { addTicketPreviewSvc } = await import("@/server/services/ticket-preview");
              const res = await addTicketPreviewSvc({
                caller,
                ticketId: data.ticketId,
                file: { mimeType: "image/png", size: buf.byteLength, data: buf },
                label: shot.label,
              });
              if (!res.ok) return { ok: false, error: res.error };
              return { ok: true };
            } catch (err) {
              return {
                ok: false,
                error: err instanceof Error ? err.message : "cli_failed",
              };
            }
          },
        );

        await publishWorkspaceEvent(data.workspaceId, {
          name: "ticket.screenshots.progress",
          workspaceId: data.workspaceId,
          ticketId: data.ticketId,
          done: i + 1,
          total: SHOTS.length,
          label: shot.label,
        });

        if (!stepResult.ok) {
          await pcli("video-stop").catch(() => {});
          await pcli("close").catch(() => {});
          return fail(stepResult.error ?? "shot_failed");
        }
      }

      // Stop recording and ship the video as a final preview.
      await step.run("upload-video", async () => {
        await pcli("video-stop");
        const buf = await fs.readFile(videoFile).catch(() => null);
        if (!buf || buf.byteLength === 0) return { ok: false, reason: "empty_video" };
        const { addTicketPreviewSvc } = await import("@/server/services/ticket-preview");
        await addTicketPreviewSvc({
          caller,
          ticketId: data.ticketId,
          file: { mimeType: "video/webm", size: buf.byteLength, data: buf },
          label: "Walkthrough",
        });
        return { ok: true };
      });
    } catch (err) {
      logger.error("ticket.screenshots.failed", {
        ticketId: data.ticketId,
        error: err instanceof Error ? err.message : String(err),
      });
      return fail(err instanceof Error ? err.message : "capture_failed");
    } finally {
      await run(PCLI_BIN, [`-s=${session}`, "close"]).catch(() => {});
      await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
    }

    return { ok: true, ticketId: data.ticketId, shots: SHOTS.length };
  },
);

export const inngestFunctions = [
  ticketCreated,
  reapStaleAgentJobs,
  workflowStepCompleted,
  captureTicketScreenshots,
];

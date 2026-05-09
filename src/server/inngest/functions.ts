import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inferTicketPriority, runOpenRouterForTicket } from "@/server/openrouter";
import { reconcileBuildingTicket } from "@/server/services/ticket-status";

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
        by: ticket.id,
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

export const reapStaleAgentJobs = inngest.createFunction(
  {
    id: "reap-stale-agent-jobs",
    name: "Reap stale AgentJob rows",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);

    const stale = await step.run("find-stale", () =>
      prisma.agentJob.findMany({
        where: { status: "RUNNING", updatedAt: { lt: cutoff } },
        select: {
          id: true,
          workspaceId: true,
          ticketId: true,
          userId: true,
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
          }).catch((error: unknown) => {
            logger.warn("ticket.reconcile.failed", {
              ticketId: job.ticketId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      });
    }

    // Belt-and-suspenders: tickets stranded in `building` whose latest
    // AgentJob is already terminal. This catches the original zombie path
    // where the renderer-side `decideEndOfRun` never fired (panel was
    // closed mid-run) but the underlying job actually completed cleanly.
    const stranded = await step.run("find-stranded-tickets", () =>
      prisma.ticket.findMany({
        where: {
          archivedAt: null,
          status: { key: "building" },
          updatedAt: { lt: cutoff },
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

    return { reaped: stale.length, strandedReconciled };
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
  const m = opts.prUrl.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
  );
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
              const { addTicketPreviewSvc } = await import(
                "@/server/services/ticket-preview"
              );
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
  captureTicketScreenshots,
];

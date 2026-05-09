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

export const inngestFunctions = [ticketCreated, reapStaleAgentJobs];

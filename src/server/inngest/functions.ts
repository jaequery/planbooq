import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { runOpenRouterForTicket } from "@/server/openrouter";

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

type WorkflowRunStartPayload = {
  runId: string;
  ticketId: string;
  workspaceId: string;
};

export const workflowRunStart = inngest.createFunction(
  {
    id: "workflow-run-start",
    name: "Workflow run: execute steps",
    triggers: [{ event: "workflow/run.start" }],
  },
  async ({ event, step }) => {
    const data = event.data as WorkflowRunStartPayload;

    const run = await step.run("load-run", async () => {
      const r = await prisma.workflowRun.findUnique({
        where: { id: data.runId },
        select: {
          id: true,
          status: true,
          stepRuns: {
            orderBy: { position: "asc" },
            select: { id: true, name: true, prompt: true, position: true },
          },
        },
      });
      return r;
    });

    if (!run) return { ok: false, error: "run_not_found" };

    await step.run("mark-running", async () => {
      await prisma.workflowRun.update({
        where: { id: data.runId },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      return { ok: true };
    });

    for (const sr of run.stepRuns) {
      await step.run(`step-${sr.position}`, async () => {
        await prisma.workflowStepRun.update({
          where: { id: sr.id },
          data: { status: "RUNNING", startedAt: new Date() },
        });

        // Stub execution: log the prompt. Real worker integration lands when
        // the Variant/worker system goes live (see CLAUDE.md "Variants" section).
        const output = `[stub] would execute step "${sr.name}" with prompt:\n${sr.prompt}`;
        logger.info("workflow.step.stub", {
          runId: data.runId,
          stepRunId: sr.id,
          ticketId: data.ticketId,
          name: sr.name,
        });

        await prisma.workflowStepRun.update({
          where: { id: sr.id },
          data: { status: "SUCCEEDED", output, finishedAt: new Date() },
        });

        await prisma.ticketActivity.create({
          data: {
            ticketId: data.ticketId,
            workspaceId: data.workspaceId,
            kind: "NOTE",
            payload: {
              source: "workflow",
              runId: data.runId,
              stepRunId: sr.id,
              position: sr.position,
              name: sr.name,
            },
          },
        });

        return { ok: true };
      });
    }

    await step.run("mark-finished", async () => {
      await prisma.workflowRun.update({
        where: { id: data.runId },
        data: { status: "SUCCEEDED", finishedAt: new Date() },
      });
      return { ok: true };
    });

    return { ok: true, runId: data.runId, steps: run.stepRuns.length };
  },
);

export const inngestFunctions = [ticketCreated, workflowRunStart];

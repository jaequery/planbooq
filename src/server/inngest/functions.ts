import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { runOpenRouterForTicket } from "@/server/openrouter";
import { recordAiSystemMessageSvc } from "@/server/services/ai-chat";

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
      const ws = await prisma.workspace.findUnique({
        where: { id: data.workspaceId },
        select: { openrouterKeyCiphertext: true },
      });
      if (!ws?.openrouterKeyCiphertext) return { ran: false };

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

type AiCodeRunPayload = {
  ticketId: string;
  workspaceId: string;
  requestedBy: string;
};

export const ticketAiCodeRun = inngest.createFunction(
  {
    id: "ticket-ai-code-run",
    name: "Ticket AI code run",
    triggers: [{ event: "ticket/ai-code-run.requested" }],
  },
  async ({ event, step }) => {
    const data = event.data as AiCodeRunPayload;

    await step.run("log-ai-code-run", () => {
      logger.info("inngest.ai-code-run.received", {
        ticketId: data.ticketId,
        workspaceId: data.workspaceId,
      });
      return { ok: true };
    });

    // Worker stub: the eventual implementation spawns a git worktree, runs the
    // Claude Code agent SDK against it, commits the diff, opens a PR, and
    // posts the PR link back to the chat thread. For now we record a system
    // message so the UI surface and event flow are fully functional.
    await step.run("post-stub-result", async () => {
      await recordAiSystemMessageSvc({
        ticketId: data.ticketId,
        workspaceId: data.workspaceId,
        body: "Code agent worker is not yet wired to a runtime. The request was logged; once the agent SDK integration ships, this message will be replaced by a real branch + PR link.",
        kind: "code-run-result",
      });
      return { ok: true };
    });

    return { ticketId: data.ticketId };
  },
);

export const inngestFunctions = [ticketCreated, ticketAiCodeRun];

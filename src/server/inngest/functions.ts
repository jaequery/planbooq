import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { getOpenRouterApiKey, runOpenRouterForTicket } from "@/server/openrouter";

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
      if (!getOpenRouterApiKey()) return { ran: false };

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

export const inngestFunctions = [ticketCreated];

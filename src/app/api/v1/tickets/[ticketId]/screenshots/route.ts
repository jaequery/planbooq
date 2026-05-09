import { logger } from "@/lib/logger";
import {
  assertWorkspaceAccess,
  jsonErr,
  jsonOk,
  mapErrorToStatus,
  requireCaller,
} from "@/server/api-auth";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true, projectId: true, prUrl: true },
  });
  if (!ticket) return jsonErr("ticket_not_found", mapErrorToStatus("ticket_not_found"));
  const denied = await assertWorkspaceAccess(caller, ticket.workspaceId);
  if (denied) return jsonErr("forbidden", mapErrorToStatus("forbidden"));

  void inngest
    .send({
      name: "ticket.screenshots.requested",
      data: {
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
        projectId: ticket.projectId,
        prUrl: ticket.prUrl,
        requestedByUserId: caller.userId,
      },
    })
    .catch((error: unknown) => {
      logger.warn("inngest.send.failed", {
        name: "ticket.screenshots.requested",
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return jsonOk({ queued: true });
}

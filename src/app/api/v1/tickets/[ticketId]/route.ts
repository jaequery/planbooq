import { jsonErr, jsonOk, mapErrorToStatus, requireCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";
import { deleteTicketSvc, getTicketSvc, updateTicketSvc } from "@/server/services/tickets";
import { withIdentifier } from "../../_lib/decorate-ticket";

async function resolveWorkflow(ticketId: string, projectId: string) {
  const overrideSteps = await prisma.workflowStep.findMany({
    where: { ticketId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, prompt: true, position: true, enabled: true },
  });
  if (overrideSteps.length > 0) {
    return {
      hasOverride: true as const,
      templateId: null,
      templateName: null,
      steps: overrideSteps.map((s) => ({ ...s, source: "ticket" as const })),
    };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      defaultWorkflowTemplate: {
        select: {
          id: true,
          name: true,
          steps: {
            orderBy: { position: "asc" },
            select: { id: true, name: true, prompt: true, position: true, enabled: true },
          },
        },
      },
    },
  });
  const tpl = project?.defaultWorkflowTemplate;
  return {
    hasOverride: false as const,
    templateId: tpl?.id ?? null,
    templateName: tpl?.name ?? null,
    steps: (tpl?.steps ?? []).map((s) => ({ ...s, source: "template" as const })),
  };
}

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const r = await getTicketSvc(caller.userId, ticketId);
  if (!r.ok) return jsonErr(r.error, mapErrorToStatus(r.error));
  const workflow = await resolveWorkflow(r.data.id, r.data.projectId);
  return jsonOk({ ...withIdentifier(r.data), workflow });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("validation_error", 400);
  const r = await updateTicketSvc(caller.userId, ticketId, body);
  return r.ok ? jsonOk(withIdentifier(r.data)) : jsonErr(r.error, mapErrorToStatus(r.error));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { ticketId } = await ctx.params;
  const r = await deleteTicketSvc(caller.userId, ticketId);
  return r.ok ? jsonOk(r.data) : jsonErr(r.error, mapErrorToStatus(r.error));
}

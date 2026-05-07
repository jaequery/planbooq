"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { moveTicketToStatusKey } from "@/server/services/ticket-status";

type Ok<T> = T extends Record<string, never> ? { ok: true } : { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;
type Empty = Record<string, never>;

async function requireUserId(): Promise<{ ok: true; userId: string } | Err> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  return { ok: true, userId: session.user.id };
}

async function requireMember(
  workspaceId: string,
): Promise<{ ok: true; userId: string } | Err> {
  const u = await requireUserId();
  if (!u.ok) return u;
  const m = await prisma.member.findFirst({
    where: { userId: u.userId, workspaceId },
    select: { id: true },
  });
  if (!m) return { ok: false, error: "forbidden" };
  return { ok: true, userId: u.userId };
}

const NameSchema = z.string().min(1).max(80);
const PromptSchema = z.string().min(1).max(8000);

// ---------- Templates ----------

export async function listWorkflowTemplates(input: {
  workspaceId: string;
}): Promise<
  Result<{
    templates: Array<{
      id: string;
      name: string;
      description: string | null;
      stepCount: number;
    }>;
  }>
> {
  const ctx = await requireMember(input.workspaceId);
  if (!ctx.ok) return ctx;
  const templates = await prisma.workflowTemplate.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, description: true, _count: { select: { steps: true } } },
  });
  return {
    ok: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      stepCount: t._count.steps,
    })),
  };
}

async function loadTemplate(templateId: string) {
  return prisma.workflowTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, workspaceId: true },
  });
}

export async function getWorkflowTemplate(templateId: string): Promise<
  Result<{
    template: {
      id: string;
      name: string;
      description: string | null;
      steps: Array<{ id: string; name: string; prompt: string; position: number; enabled: boolean }>;
    };
  }>
> {
  const owner = await loadTemplate(templateId);
  if (!owner) return { ok: false, error: "not_found" };
  const ctx = await requireMember(owner.workspaceId);
  if (!ctx.ok) return ctx;
  const t = await prisma.workflowTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      description: true,
      steps: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, prompt: true, position: true, enabled: true },
      },
    },
  });
  if (!t) return { ok: false, error: "not_found" };
  return { ok: true, template: t };
}

export async function createWorkflowTemplate(input: {
  workspaceId: string;
  name: string;
  description?: string;
}): Promise<Result<{ id: string }>> {
  const ctx = await requireMember(input.workspaceId);
  if (!ctx.ok) return ctx;
  const name = NameSchema.parse(input.name);
  const description = input.description ? input.description.slice(0, 4000) : null;
  const t = await prisma.workflowTemplate.create({
    data: { workspaceId: input.workspaceId, name, description },
    select: { id: true },
  });
  revalidatePath("/settings");
  return { ok: true, id: t.id };
}

export async function updateWorkflowTemplate(input: {
  id: string;
  name?: string;
  description?: string | null;
}): Promise<Result<Empty>> {
  const owner = await loadTemplate(input.id);
  if (!owner) return { ok: false, error: "not_found" };
  const ctx = await requireMember(owner.workspaceId);
  if (!ctx.ok) return ctx;
  await prisma.workflowTemplate.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: NameSchema.parse(input.name) } : {}),
      ...(input.description !== undefined
        ? { description: input.description ? input.description.slice(0, 4000) : null }
        : {}),
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteWorkflowTemplate(id: string): Promise<Result<Empty>> {
  const owner = await loadTemplate(id);
  if (!owner) return { ok: false, error: "not_found" };
  const ctx = await requireMember(owner.workspaceId);
  if (!ctx.ok) return ctx;
  await prisma.workflowTemplate.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Template steps ----------

async function loadStepOwner(stepId: string) {
  const s = await prisma.workflowStep.findUnique({
    where: { id: stepId },
    select: {
      template: { select: { workspaceId: true } },
      ticket: { select: { workspaceId: true } },
    },
  });
  return s?.template?.workspaceId ?? s?.ticket?.workspaceId ?? null;
}

export async function addTemplateStep(input: {
  templateId: string;
  name: string;
  prompt: string;
}): Promise<Result<{ id: string }>> {
  const owner = await loadTemplate(input.templateId);
  if (!owner) return { ok: false, error: "not_found" };
  const ctx = await requireMember(owner.workspaceId);
  if (!ctx.ok) return ctx;
  const name = NameSchema.parse(input.name);
  const prompt = PromptSchema.parse(input.prompt);

  // Concurrency-safe append: lock template row, then read max position
  // inside the same transaction so two concurrent adds can't collide.
  const step = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "WorkflowTemplate" WHERE id = ${input.templateId} FOR UPDATE`;
    const last = await tx.workflowStep.findFirst({
      where: { templateId: input.templateId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.workflowStep.create({
      data: {
        templateId: input.templateId,
        name,
        prompt,
        position: (last?.position ?? 0) + 1024,
      },
      select: { id: true },
    });
  });
  revalidatePath("/settings");
  return { ok: true, id: step.id };
}

export async function updateTemplateStep(input: {
  id: string;
  name?: string;
  prompt?: string;
  enabled?: boolean;
}): Promise<Result<Empty>> {
  const ws = await loadStepOwner(input.id);
  if (!ws) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ws);
  if (!ctx.ok) return ctx;
  await prisma.workflowStep.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: NameSchema.parse(input.name) } : {}),
      ...(input.prompt !== undefined ? { prompt: PromptSchema.parse(input.prompt) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeTemplateStep(id: string): Promise<Result<Empty>> {
  const ws = await loadStepOwner(id);
  if (!ws) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ws);
  if (!ctx.ok) return ctx;
  await prisma.workflowStep.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function reorderTemplateSteps(input: {
  templateId: string;
  orderedStepIds: string[];
}): Promise<Result<Empty>> {
  const owner = await loadTemplate(input.templateId);
  if (!owner) return { ok: false, error: "not_found" };
  const ctx = await requireMember(owner.workspaceId);
  if (!ctx.ok) return ctx;
  const existing = await prisma.workflowStep.findMany({
    where: { templateId: input.templateId },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((s) => s.id));
  if (
    input.orderedStepIds.length !== existing.length ||
    input.orderedStepIds.some((id) => !existingSet.has(id))
  )
    return { ok: false, error: "id_mismatch" };
  await prisma.$transaction(
    input.orderedStepIds.map((id, i) =>
      prisma.workflowStep.update({ where: { id }, data: { position: (i + 1) * 1024 } }),
    ),
  );
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Project default ----------

async function loadProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
}

export async function getProjectDefaultWorkflow(
  projectId: string,
): Promise<Result<{ templateId: string | null }>> {
  const proj = await loadProject(projectId);
  if (!proj) return { ok: false, error: "not_found" };
  const ctx = await requireMember(proj.workspaceId);
  if (!ctx.ok) return ctx;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { defaultWorkflowTemplateId: true },
  });
  return { ok: true, templateId: p?.defaultWorkflowTemplateId ?? null };
}

export async function setProjectDefaultWorkflow(input: {
  projectId: string;
  templateId: string | null;
}): Promise<Result<Empty>> {
  const proj = await loadProject(input.projectId);
  if (!proj) return { ok: false, error: "not_found" };
  const ctx = await requireMember(proj.workspaceId);
  if (!ctx.ok) return ctx;
  if (input.templateId) {
    const t = await loadTemplate(input.templateId);
    if (!t || t.workspaceId !== proj.workspaceId)
      return { ok: false, error: "template_not_found" };
  }
  await prisma.project.update({
    where: { id: input.projectId },
    data: { defaultWorkflowTemplateId: input.templateId },
  });
  revalidatePath("/");
  return { ok: true };
}

// ---------- Ticket override ----------

async function loadTicket(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true, projectId: true },
  });
}

export async function getTicketWorkflow(ticketId: string): Promise<
  Result<{
    hasOverride: boolean;
    templateId: string | null;
    templateName: string | null;
    steps: Array<{
      id: string | null;
      name: string;
      prompt: string;
      position: number;
      enabled: boolean;
      source: "ticket" | "template";
    }>;
  }>
> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;

  const overrideSteps = await prisma.workflowStep.findMany({
    where: { ticketId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, prompt: true, position: true, enabled: true },
  });
  if (overrideSteps.length > 0) {
    return {
      ok: true,
      hasOverride: true,
      templateId: null,
      templateName: null,
      steps: overrideSteps.map((s) => ({ ...s, source: "ticket" as const })),
    };
  }
  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
    select: {
      defaultWorkflowTemplateId: true,
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
    ok: true,
    hasOverride: false,
    templateId: tpl?.id ?? null,
    templateName: tpl?.name ?? null,
    steps: (tpl?.steps ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      prompt: s.prompt,
      position: s.position,
      enabled: s.enabled,
      source: "template" as const,
    })),
  };
}

export async function enableTicketWorkflowOverride(
  ticketId: string,
): Promise<Result<Empty>> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  const existing = await prisma.workflowStep.count({ where: { ticketId } });
  if (existing > 0) return { ok: true };
  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
    select: {
      defaultWorkflowTemplate: {
        select: {
          steps: {
            orderBy: { position: "asc" },
            select: { name: true, prompt: true, enabled: true },
          },
        },
      },
    },
  });
  const seedSteps = project?.defaultWorkflowTemplate?.steps ?? [];
  if (seedSteps.length > 0) {
    await prisma.workflowStep.createMany({
      data: seedSteps.map((s, i) => ({
        ticketId,
        name: s.name,
        prompt: s.prompt,
        enabled: s.enabled,
        position: (i + 1) * 1024,
      })),
    });
  } else {
    await prisma.workflowStep.create({
      data: {
        ticketId,
        name: "New step",
        prompt: "Describe what this step should do.",
        position: 1024,
      },
    });
  }
  revalidatePath("/");
  return { ok: true };
}

export async function setTicketWorkflowFromTemplate(input: {
  ticketId: string;
  templateId: string;
}): Promise<Result<Empty>> {
  const ticket = await loadTicket(input.ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  const tpl = await loadTemplate(input.templateId);
  if (!tpl) return { ok: false, error: "template_not_found" };
  if (tpl.workspaceId !== ticket.workspaceId) return { ok: false, error: "forbidden" };
  const steps = await prisma.workflowStep.findMany({
    where: { templateId: input.templateId },
    orderBy: { position: "asc" },
    select: { name: true, prompt: true, enabled: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.workflowStep.deleteMany({ where: { ticketId: input.ticketId } });
    if (steps.length > 0) {
      await tx.workflowStep.createMany({
        data: steps.map((s, i) => ({
          ticketId: input.ticketId,
          name: s.name,
          prompt: s.prompt,
          enabled: s.enabled,
          position: (i + 1) * 1024,
        })),
      });
    }
  });
  revalidatePath("/");
  return { ok: true };
}

export async function disableTicketWorkflowOverride(
  ticketId: string,
): Promise<Result<Empty>> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  await prisma.workflowStep.deleteMany({ where: { ticketId } });
  revalidatePath("/");
  return { ok: true };
}

export async function addTicketStep(input: {
  ticketId: string;
  name: string;
  prompt: string;
}): Promise<Result<{ id: string }>> {
  const ticket = await loadTicket(input.ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  const name = NameSchema.parse(input.name);
  const prompt = PromptSchema.parse(input.prompt);
  const step = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Ticket" WHERE id = ${input.ticketId} FOR UPDATE`;
    const last = await tx.workflowStep.findFirst({
      where: { ticketId: input.ticketId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.workflowStep.create({
      data: {
        ticketId: input.ticketId,
        name,
        prompt,
        position: (last?.position ?? 0) + 1024,
      },
      select: { id: true },
    });
  });
  revalidatePath("/");
  return { ok: true, id: step.id };
}

export async function updateTicketStep(input: {
  id: string;
  name?: string;
  prompt?: string;
  enabled?: boolean;
}): Promise<Result<Empty>> {
  const ws = await loadStepOwner(input.id);
  if (!ws) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ws);
  if (!ctx.ok) return ctx;
  await prisma.workflowStep.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: NameSchema.parse(input.name) } : {}),
      ...(input.prompt !== undefined ? { prompt: PromptSchema.parse(input.prompt) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  revalidatePath("/");
  return { ok: true };
}

export async function removeTicketStep(id: string): Promise<Result<Empty>> {
  const ws = await loadStepOwner(id);
  if (!ws) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ws);
  if (!ctx.ok) return ctx;
  await prisma.workflowStep.delete({ where: { id } });
  revalidatePath("/");
  return { ok: true };
}

export async function reorderTicketSteps(input: {
  ticketId: string;
  orderedStepIds: string[];
}): Promise<Result<Empty>> {
  const ticket = await loadTicket(input.ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  const existing = await prisma.workflowStep.findMany({
    where: { ticketId: input.ticketId },
    select: { id: true },
  });
  const set = new Set(existing.map((s) => s.id));
  if (
    input.orderedStepIds.length !== existing.length ||
    input.orderedStepIds.some((id) => !set.has(id))
  )
    return { ok: false, error: "id_mismatch" };
  await prisma.$transaction(
    input.orderedStepIds.map((id, i) =>
      prisma.workflowStep.update({ where: { id }, data: { position: (i + 1) * 1024 } }),
    ),
  );
  revalidatePath("/");
  return { ok: true };
}

// ---------- Run trigger (audit-only) ----------

/**
 * Records a WorkflowRun for audit. Step execution is dispatched client-side
 * via the desktop Agent Chat queue (see ticket-workflow-panel.tsx → window
 * event "planbooq:workflow-run"), so this server record closes immediately
 * as SUCCEEDED rather than waiting on a sequencer that doesn't exist on
 * this code path.
 */
/**
 * Returns just enough context for the renderer to ask local Claude Code
 * which status the ticket should be in once a workflow run kicks off.
 * Pairs with `triggerWorkflowRun({ suggestedStatusKey })`.
 */
export async function getWorkflowStatusContext(ticketId: string): Promise<
  Result<{
    title: string;
    description: string | null;
    currentStatusKey: string;
    statuses: Array<{ key: string; name: string }>;
  }>
> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      title: true,
      description: true,
      workspaceId: true,
      status: { select: { key: true } },
    },
  });
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  const statuses = await prisma.status.findMany({
    where: { workspaceId: ticket.workspaceId },
    orderBy: { position: "asc" },
    select: { key: true, name: true },
  });
  return {
    ok: true,
    title: ticket.title,
    description: ticket.description,
    currentStatusKey: ticket.status?.key ?? "",
    statuses,
  };
}

export async function triggerWorkflowRun(
  ticketId: string,
  opts?: { suggestedStatusKey?: string },
): Promise<Result<{ runId: string; stepCount: number }>> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;

  const wf = await getTicketWorkflow(ticketId);
  if (!wf.ok) return wf;
  const enabled = wf.steps.filter((s) => s.enabled);
  if (enabled.length === 0) return { ok: false, error: "no_steps" };

  const now = new Date();
  const run = await prisma.workflowRun.create({
    data: {
      ticketId,
      workspaceId: ticket.workspaceId,
      templateId: wf.templateId,
      status: "SUCCEEDED",
      startedAt: now,
      finishedAt: now,
      stepRuns: {
        create: enabled.map((s, i) => ({
          position: i,
          name: s.name,
          prompt: s.prompt,
          status: "SUCCEEDED" as const,
          startedAt: now,
          finishedAt: now,
        })),
      },
    },
    select: { id: true },
  });

  // Move the ticket to the right status. The client picks the status with
  // local Claude Code (apps/desktop bridge.agentOneshot) and passes it as
  // suggestedStatusKey. We validate it against this workspace's statuses to
  // prevent a malicious or stale renderer from writing arbitrary keys. If
  // no suggestion was provided (web client, bridge unavailable, or local
  // claude failed), fall back to a deterministic rule: backlog|todo →
  // building; leave review/completed alone.
  try {
    const current = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        workspaceId: true,
        status: { select: { key: true } },
      },
    });
    if (current) {
      const statuses = await prisma.status.findMany({
        where: { workspaceId: current.workspaceId },
        orderBy: { position: "asc" },
        select: { key: true },
      });
      const allowed = new Set(statuses.map((s) => s.key));
      const currentKey = current.status?.key ?? "";
      let targetKey: string | null = null;
      if (opts?.suggestedStatusKey && allowed.has(opts.suggestedStatusKey)) {
        targetKey = opts.suggestedStatusKey;
      } else if (currentKey === "backlog" || currentKey === "todo") {
        targetKey = allowed.has("building") ? "building" : null;
      }
      if (targetKey && targetKey !== currentKey) {
        await moveTicketToStatusKey({
          ticketId,
          toStatusKey: targetKey,
          byUserId: ctx.userId,
        });
      }
    }
  } catch {
    // tolerated — the workflow run row is already persisted
  }

  revalidatePath("/");
  return { ok: true, runId: run.id, stepCount: enabled.length };
}

export async function logWorkflowActivity(input: {
  ticketId: string;
  text: string;
}): Promise<Result<{ id: string }>> {
  const ticket = await loadTicket(input.ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;
  const text = z.string().min(1).max(500).parse(input.text);

  const activity = await prisma.ticketActivity.create({
    data: {
      ticketId: input.ticketId,
      workspaceId: ticket.workspaceId,
      kind: "NOTE",
      payload: { text } as Prisma.InputJsonValue,
    },
    select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
  });

  await publishWorkspaceEvent(ticket.workspaceId, {
    name: "ticket.activity",
    workspaceId: ticket.workspaceId,
    ticketId: input.ticketId,
    activity: {
      id: activity.id,
      kind: activity.kind,
      payload: activity.payload as Record<string, unknown>,
      jobId: activity.jobId,
      createdAt: activity.createdAt.toISOString(),
    },
  });

  return { ok: true, id: activity.id };
}

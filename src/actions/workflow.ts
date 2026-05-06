"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";

type Ok<T> = T extends Record<string, never> ? { ok: true } : { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;
type Empty = Record<string, never>;

async function requireUserAndWorkspace(): Promise<
  { ok: true; userId: string; workspaceId: string } | Err
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const m = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!m) return { ok: false, error: "no_workspace" };
  return { ok: true, userId: session.user.id, workspaceId: m.workspaceId };
}

const NameSchema = z.string().min(1).max(80);
const PromptSchema = z.string().min(1).max(8000);

// ---------- Templates ----------

export async function listWorkflowTemplates(): Promise<
  Result<{ templates: Array<{ id: string; name: string; description: string | null; stepCount: number }> }>
> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const templates = await prisma.workflowTemplate.findMany({
    where: { workspaceId: ctx.workspaceId },
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

export async function getWorkflowTemplate(
  templateId: string,
): Promise<
  Result<{
    template: {
      id: string;
      name: string;
      description: string | null;
      steps: Array<{ id: string; name: string; prompt: string; position: number; enabled: boolean }>;
    };
  }>
> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const t = await prisma.workflowTemplate.findFirst({
    where: { id: templateId, workspaceId: ctx.workspaceId },
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
  name: string;
  description?: string;
}): Promise<Result<{ id: string }>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const name = NameSchema.parse(input.name);
  const description = input.description ? input.description.slice(0, 4000) : null;
  const t = await prisma.workflowTemplate.create({
    data: { workspaceId: ctx.workspaceId, name, description },
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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const exists = await prisma.workflowTemplate.findFirst({
    where: { id: input.id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!exists) return { ok: false, error: "not_found" };
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

export async function deleteWorkflowTemplate(
  id: string,
): Promise<Result<Empty>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const exists = await prisma.workflowTemplate.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!exists) return { ok: false, error: "not_found" };
  await prisma.workflowTemplate.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Template steps ----------

async function assertTemplateOwned(templateId: string, workspaceId: string): Promise<boolean> {
  const t = await prisma.workflowTemplate.findFirst({
    where: { id: templateId, workspaceId },
    select: { id: true },
  });
  return !!t;
}

async function nextTemplatePosition(templateId: string): Promise<number> {
  const last = await prisma.workflowStep.findFirst({
    where: { templateId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1024;
}

export async function addTemplateStep(input: {
  templateId: string;
  name: string;
  prompt: string;
}): Promise<Result<{ id: string }>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  if (!(await assertTemplateOwned(input.templateId, ctx.workspaceId)))
    return { ok: false, error: "not_found" };
  const name = NameSchema.parse(input.name);
  const prompt = PromptSchema.parse(input.prompt);
  const step = await prisma.workflowStep.create({
    data: {
      templateId: input.templateId,
      name,
      prompt,
      position: await nextTemplatePosition(input.templateId),
    },
    select: { id: true },
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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const step = await prisma.workflowStep.findUnique({
    where: { id: input.id },
    select: { template: { select: { workspaceId: true } } },
  });
  if (!step?.template || step.template.workspaceId !== ctx.workspaceId)
    return { ok: false, error: "not_found" };
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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const step = await prisma.workflowStep.findUnique({
    where: { id },
    select: { template: { select: { workspaceId: true } } },
  });
  if (!step?.template || step.template.workspaceId !== ctx.workspaceId)
    return { ok: false, error: "not_found" };
  await prisma.workflowStep.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function reorderTemplateSteps(input: {
  templateId: string;
  orderedStepIds: string[];
}): Promise<Result<Empty>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  if (!(await assertTemplateOwned(input.templateId, ctx.workspaceId)))
    return { ok: false, error: "not_found" };
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

export async function getProjectDefaultWorkflow(
  projectId: string,
): Promise<Result<{ templateId: string | null }>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const p = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspaceId },
    select: { defaultWorkflowTemplateId: true },
  });
  if (!p) return { ok: false, error: "not_found" };
  return { ok: true, templateId: p.defaultWorkflowTemplateId };
}

export async function setProjectDefaultWorkflow(input: {
  projectId: string;
  templateId: string | null;
}): Promise<Result<Empty>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "not_found" };
  if (input.templateId) {
    if (!(await assertTemplateOwned(input.templateId, ctx.workspaceId)))
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

async function ticketInWorkspace(ticketId: string, workspaceId: string) {
  return prisma.ticket.findFirst({
    where: { id: ticketId, workspaceId },
    select: { id: true, projectId: true },
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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };

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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };
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
    // Seed a single placeholder step so the override surface is non-empty.
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

export async function disableTicketWorkflowOverride(
  ticketId: string,
): Promise<Result<Empty>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };
  await prisma.workflowStep.deleteMany({ where: { ticketId } });
  revalidatePath("/");
  return { ok: true };
}

async function nextTicketPosition(ticketId: string): Promise<number> {
  const last = await prisma.workflowStep.findFirst({
    where: { ticketId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1024;
}

export async function addTicketStep(input: {
  ticketId: string;
  name: string;
  prompt: string;
}): Promise<Result<{ id: string }>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(input.ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };
  const step = await prisma.workflowStep.create({
    data: {
      ticketId: input.ticketId,
      name: NameSchema.parse(input.name),
      prompt: PromptSchema.parse(input.prompt),
      position: await nextTicketPosition(input.ticketId),
    },
    select: { id: true },
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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const step = await prisma.workflowStep.findUnique({
    where: { id: input.id },
    select: { ticket: { select: { workspaceId: true } } },
  });
  if (!step?.ticket || step.ticket.workspaceId !== ctx.workspaceId)
    return { ok: false, error: "not_found" };
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
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const step = await prisma.workflowStep.findUnique({
    where: { id },
    select: { ticket: { select: { workspaceId: true } } },
  });
  if (!step?.ticket || step.ticket.workspaceId !== ctx.workspaceId)
    return { ok: false, error: "not_found" };
  await prisma.workflowStep.delete({ where: { id } });
  revalidatePath("/");
  return { ok: true };
}

export async function reorderTicketSteps(input: {
  ticketId: string;
  orderedStepIds: string[];
}): Promise<Result<Empty>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(input.ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };
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

// ---------- Run trigger + history ----------

export async function triggerWorkflowRun(
  ticketId: string,
): Promise<Result<{ runId: string; stepCount: number }>> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };

  const wf = await getTicketWorkflow(ticketId);
  if (!wf.ok) return wf;
  const enabled = wf.steps.filter((s) => s.enabled);
  if (enabled.length === 0) return { ok: false, error: "no_steps" };

  const run = await prisma.workflowRun.create({
    data: {
      ticketId,
      workspaceId: ctx.workspaceId,
      templateId: wf.templateId,
      status: "PENDING",
      stepRuns: {
        create: enabled.map((s, i) => ({
          position: i,
          name: s.name,
          prompt: s.prompt,
          status: "PENDING" as const,
        })),
      },
    },
    select: { id: true },
  });

  await inngest.send({
    name: "workflow/run.start",
    data: { runId: run.id, ticketId, workspaceId: ctx.workspaceId },
  });

  revalidatePath("/");
  return { ok: true, runId: run.id, stepCount: enabled.length };
}

export async function listWorkflowRuns(ticketId: string): Promise<
  Result<{
    runs: Array<{
      id: string;
      status: string;
      createdAt: Date;
      finishedAt: Date | null;
      stepCount: number;
      stepRuns: Array<{
        id: string;
        name: string;
        position: number;
        status: string;
        finishedAt: Date | null;
      }>;
    }>;
  }>
> {
  const ctx = await requireUserAndWorkspace();
  if (!ctx.ok) return ctx;
  const ticket = await ticketInWorkspace(ticketId, ctx.workspaceId);
  if (!ticket) return { ok: false, error: "not_found" };
  const runs = await prisma.workflowRun.findMany({
    where: { ticketId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      createdAt: true,
      finishedAt: true,
      stepRuns: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, position: true, status: true, finishedAt: true },
      },
    },
  });
  return {
    ok: true,
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
      stepCount: r.stepRuns.length,
      stepRuns: r.stepRuns,
    })),
  };
}

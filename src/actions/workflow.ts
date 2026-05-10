"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getPrStatusForUser, parseGitHubPrUrl } from "@/server/services/github-pr";
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

const NameSchema = z.string().min(1);
const PromptSchema = z.string().min(1);

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

const SYSTEM_DEFAULT_WORKFLOW_NAME = "Default";
const SYSTEM_DEFAULT_WORKFLOW_STEPS: Array<{ name: string; prompt: string }> = [
  {
    name: "Plan",
    prompt:
      "Read the ticket title and description carefully. Outline a concrete implementation plan before touching code: list the files you expect to change, the approach, and any risks or open questions.",
  },
  {
    name: "Build",
    prompt:
      "Implement the plan. Make the smallest set of changes needed to satisfy the ticket. Run typecheck/lint and fix any regressions.",
  },
  {
    name: "Issue PR",
    prompt:
      "Follow the shipping steps in PLANBOOQ.md to commit, push, open a GitHub PR, and call `./.planbooq/pbq ship` with the PR URL.",
  },
];

/**
 * Ensures a system default workflow template exists for the workspace and is
 * set as the project's default. Idempotent — safe to call on every workflow
 * fetch when the project has no default configured.
 */
async function ensureSystemDefaultWorkflow(
  workspaceId: string,
  projectId: string,
): Promise<{ id: string; name: string; steps: Array<{ id: string; name: string; prompt: string; position: number; enabled: boolean }> } | null> {
  const existing = await prisma.workflowTemplate.findFirst({
    where: { workspaceId, isGlobal: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      steps: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, prompt: true, position: true, enabled: true },
      },
    },
  });

  let template = existing;
  if (!template) {
    const created = await prisma.workflowTemplate.create({
      data: {
        workspaceId,
        name: SYSTEM_DEFAULT_WORKFLOW_NAME,
        isGlobal: true,
        steps: {
          create: SYSTEM_DEFAULT_WORKFLOW_STEPS.map((s, i) => ({
            name: s.name,
            prompt: s.prompt,
            position: (i + 1) * 1024,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        steps: {
          orderBy: { position: "asc" },
          select: { id: true, name: true, prompt: true, position: true, enabled: true },
        },
      },
    });
    template = created;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { defaultWorkflowTemplateId: template.id },
  });

  return template;
}

/**
 * Map a step name to a "kind" we know how to derive completion for.
 * Default-template names get unambiguous matches; user-named steps fall
 * back to `unknown` and the client-side FIFO heuristic decides.
 */
type StepKind = "build" | "pr" | "test" | "unknown";

function classifyStepKind(name: string): StepKind {
  const n = name.toLowerCase();
  if (/\b(pr|pull[\s-]?request|ship|merge)\b/.test(n)) return "pr";
  if (/\b(issue|open|create|raise)\b.*\bpr\b/.test(n)) return "pr";
  if (/\b(test|verify|qa|e2e|playwright|vitest|jest)\b/.test(n)) return "test";
  if (/\b(build|implement|develop|code|make|fix|refactor)\b/.test(n)) return "build";
  return "unknown";
}

/**
 * Authoritative signals for step completion. We derive at read time from
 * real state (prUrl, AgentJobs, TicketActivity) instead of trusting a
 * stored stepRun row, because the actual work happens in many places
 * (desktop bridge, CLI via pbq, agent webhook) and stored rows drift.
 *
 * - build  → an EXECUTE AgentJob has SUCCEEDED, OR a BUILD/COMMIT_PUSHED
 *            activity exists, OR the PR is up (PR ⇒ build implicitly done)
 * - pr     → ticket.prUrl is set, OR a PR_CREATED activity exists
 * - test   → a TEST_RUN activity exists
 * - unknown→ null (let client decide via FIFO)
 */
async function deriveStepCompletion(args: {
  ticketId: string;
  prUrl: string | null;
  statusKey: string | null;
  steps: Array<{ name: string }>;
}): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  const kinds = args.steps.map((s) => classifyStepKind(s.name));
  const need = new Set(kinds);

  // Terminal status is the strongest possible signal: if the ticket has
  // reached `review` or `completed`, every preceding workflow step is by
  // definition done. This catches the case where a step is named in a way
  // the regex can't classify, or where activity rows didn't get written.
  const terminal = args.statusKey === "review" || args.statusKey === "completed";

  let hasBuildJob = false;
  let hasBuildActivity = false;
  let hasPrActivity = false;
  let hasTestActivity = false;

  if (need.has("build")) {
    hasBuildJob = !!(await prisma.agentJob.findFirst({
      where: { ticketId: args.ticketId, kind: "EXECUTE", status: "SUCCEEDED" },
      select: { id: true },
    }));
    if (!hasBuildJob) {
      hasBuildActivity = !!(await prisma.ticketActivity.findFirst({
        where: { ticketId: args.ticketId, kind: { in: ["BUILD", "COMMIT_PUSHED"] } },
        select: { id: true },
      }));
    }
  }
  if (need.has("pr") && !args.prUrl) {
    hasPrActivity = !!(await prisma.ticketActivity.findFirst({
      where: { ticketId: args.ticketId, kind: "PR_CREATED" },
      select: { id: true },
    }));
  }
  if (need.has("test")) {
    hasTestActivity = !!(await prisma.ticketActivity.findFirst({
      where: { ticketId: args.ticketId, kind: "TEST_RUN" },
      select: { id: true },
    }));
  }

  for (let i = 0; i < args.steps.length; i++) {
    const step = args.steps[i];
    const kind = kinds[i];
    if (!step || !kind) continue;
    const name = step.name;
    let completed: boolean | null;
    switch (kind) {
      case "build":
        completed = terminal || !!args.prUrl || hasBuildJob || hasBuildActivity;
        break;
      case "pr":
        completed = terminal || !!args.prUrl || hasPrActivity;
        break;
      case "test":
        completed = terminal || hasTestActivity;
        break;
      default:
        // Unknown-kind steps: terminal status still implies done. Otherwise
        // fall back to the client FIFO heuristic (null).
        completed = terminal ? true : null;
    }
    out.set(name, completed);
  }
  return out;
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
      /** Server-derived from authoritative signals; null = no signal,
       *  client FIFO heuristic decides. */
      completed: boolean | null;
    }>;
  }>
> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;

  const ticketState = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { prUrl: true, status: { select: { key: true } } },
  });
  const prUrl = ticketState?.prUrl ?? null;
  const statusKey = ticketState?.status?.key ?? null;

  const overrideSteps = await prisma.workflowStep.findMany({
    where: { ticketId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, prompt: true, position: true, enabled: true },
  });
  if (overrideSteps.length > 0) {
    const completion = await deriveStepCompletion({
      ticketId,
      prUrl,
      statusKey,
      steps: overrideSteps,
    });
    return {
      ok: true,
      hasOverride: true,
      templateId: null,
      templateName: null,
      steps: overrideSteps.map((s) => ({
        ...s,
        source: "ticket" as const,
        completed: completion.get(s.name) ?? null,
      })),
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
  let tpl = project?.defaultWorkflowTemplate ?? null;
  if (!tpl) {
    const ensured = await ensureSystemDefaultWorkflow(ticket.workspaceId, ticket.projectId);
    if (ensured) {
      tpl = {
        id: ensured.id,
        name: ensured.name,
        steps: ensured.steps,
      };
    }
  }
  const tplSteps = tpl?.steps ?? [];
  const completion = await deriveStepCompletion({
    ticketId,
    prUrl,
    statusKey,
    steps: tplSteps,
  });
  return {
    ok: true,
    hasOverride: false,
    templateId: tpl?.id ?? null,
    templateName: tpl?.name ?? null,
    steps: tplSteps.map((s) => ({
      id: s.id,
      name: s.name,
      prompt: s.prompt,
      position: s.position,
      enabled: s.enabled,
      source: "template" as const,
      completed: completion.get(s.name) ?? null,
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
  // When no steps are configured, record a synthetic "build" step so the
  // ticket still progresses (status move + audit row) under the default
  // Execute behavior.
  const recorded = enabled.length === 0
    ? [{ name: "build", prompt: "Default build (no workflow steps configured)." }]
    : enabled.map((s) => ({ name: s.name, prompt: s.prompt }));

  const now = new Date();
  // Record the run as RUNNING with PENDING stepRuns. Marking everything
  // SUCCEEDED at trigger time was misleading — it caused the UI to show
  // every step checked the moment Run was clicked, even though the agent
  // hadn't done a thing yet. Real completion is derived at read time
  // from authoritative signals (prUrl, AgentJobs, TicketActivity).
  const run = await prisma.workflowRun.create({
    data: {
      ticketId,
      workspaceId: ticket.workspaceId,
      templateId: wf.templateId,
      status: "RUNNING",
      startedAt: now,
      stepRuns: {
        create: recorded.map((s, i) => ({
          position: i,
          name: s.name,
          prompt: s.prompt,
          status: "PENDING" as const,
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
  return { ok: true, runId: run.id, stepCount: recorded.length };
}

/**
 * Apply a status suggestion produced by local Claude Code after the workflow
 * run already started. Used to refine the deterministic move applied by
 * `triggerWorkflowRun` when the LLM picks a more specific column.
 */
export async function applyWorkflowStatusSuggestion(
  ticketId: string,
  suggestedStatusKey: string,
): Promise<Result<Empty>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { workspaceId: true, status: { select: { key: true } } },
  });
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;

  const statuses = await prisma.status.findMany({
    where: { workspaceId: ticket.workspaceId },
    select: { key: true },
  });
  const allowed = new Set(statuses.map((s) => s.key));
  if (!allowed.has(suggestedStatusKey)) {
    return { ok: false, error: "invalid_status" };
  }
  const currentKey = ticket.status?.key ?? "";
  if (suggestedStatusKey === currentKey) return { ok: true };

  await moveTicketToStatusKey({
    ticketId,
    toStatusKey: suggestedStatusKey,
    byUserId: ctx.userId,
  });
  revalidatePath("/");
  return { ok: true };
}

/**
 * Decide what status a ticket should land in once the agent has stopped
 * working on it. Mirrors the start-of-run status pick in `triggerWorkflowRun`,
 * but for the end-of-run side: if a PR is open it should land in review (or
 * completed/blocked depending on merge state), otherwise return null so the
 * caller can fall back to a local-LLM pick.
 *
 * Only fires when the ticket is currently in `building` — we never override
 * an explicit user move.
 */
export async function decideEndOfRunStatus(
  ticketId: string,
): Promise<Result<{ statusKey: string | null; reason: string }>> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      workspaceId: true,
      prUrl: true,
      status: { select: { key: true } },
    },
  });
  if (!ticket) return { ok: false, error: "not_found" };
  const ctx = await requireMember(ticket.workspaceId);
  if (!ctx.ok) return ctx;

  const currentKey = ticket.status?.key ?? "";
  if (currentKey !== "building") {
    return { ok: true, statusKey: null, reason: "not-building" };
  }

  const statuses = await prisma.status.findMany({
    where: { workspaceId: ticket.workspaceId },
    select: { key: true },
  });
  const allowed = new Set(statuses.map((s) => s.key));
  const pick = (k: string): string | null => (allowed.has(k) ? k : null);

  const pr = parseGitHubPrUrl(ticket.prUrl);
  if (!ticket.prUrl || !pr) {
    return { ok: true, statusKey: null, reason: "no-pr" };
  }

  const outcome = await getPrStatusForUser({ userId: ctx.userId, pr });
  if (outcome.kind !== "ok") {
    return { ok: true, statusKey: null, reason: `pr-${outcome.kind}` };
  }
  const s = outcome.status;
  let target: string | null = null;
  let reason = "pr-open";
  if (s.merged) {
    target = pick("completed") ?? pick("review");
    reason = "pr-merged";
  } else if (s.state === "closed") {
    target = pick("blocked") ?? pick("review");
    reason = "pr-closed";
  } else if (s.mergeable === false) {
    target = pick("blocked") ?? pick("review");
    reason = "pr-conflict";
  } else {
    target = pick("review");
    reason = "pr-open";
  }
  if (!target || target === currentKey) {
    return { ok: true, statusKey: null, reason: `${reason}-noop` };
  }
  await moveTicketToStatusKey({
    ticketId,
    toStatusKey: target,
    byUserId: ctx.userId,
  });
  revalidatePath("/");
  return { ok: true, statusKey: target, reason };
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

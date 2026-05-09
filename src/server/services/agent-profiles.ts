import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type {
  AgentProfileFull,
  AgentProfileSummary,
  ServerActionResult,
  TicketAgentProfileLink,
} from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const NAME_MAX = 80;
const DESC_MAX = 280;
const BODY_MAX = 50_000;

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const m = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!m) throw new Error("forbidden");
}

const SUMMARY_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} satisfies Prisma.AgentProfileSelect;

const FULL_SELECT = { ...SUMMARY_SELECT, body: true } satisfies Prisma.AgentProfileSelect;

// ---------------- List ----------------

export const ListAgentProfilesSchema = z
  .object({
    workspaceId: z.string().min(1),
    includeInactive: z.boolean().optional(),
  })
  .strict();

export async function listAgentProfilesSvc(
  userId: string,
  input: z.infer<typeof ListAgentProfilesSchema>,
): Promise<ServerActionResult<AgentProfileSummary[]>> {
  try {
    const { workspaceId, includeInactive } = ListAgentProfilesSchema.parse(input);
    await requireMembership(workspaceId, userId);
    const rows = await prisma.agentProfile.findMany({
      where: {
        workspaceId,
        ...(includeInactive ? {} : { isActive: true, archivedAt: null }),
      },
      orderBy: { name: "asc" },
      select: SUMMARY_SELECT,
    });
    return { ok: true, data: rows };
  } catch (e) {
    logger.error("listAgentProfiles.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Get ----------------

export const GetAgentProfileSchema = z.object({ id: z.string().min(1) }).strict();

export async function getAgentProfileSvc(
  userId: string,
  input: z.infer<typeof GetAgentProfileSchema>,
): Promise<ServerActionResult<AgentProfileFull>> {
  try {
    const { id } = GetAgentProfileSchema.parse(input);
    const row = await prisma.agentProfile.findUnique({ where: { id }, select: FULL_SELECT });
    if (!row) return { ok: false, error: "not_found" };
    await requireMembership(row.workspaceId, userId);
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Create ----------------

export const CreateAgentProfileSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z.string().trim().min(1).max(NAME_MAX),
    description: z.string().trim().max(DESC_MAX).optional(),
    body: z.string().min(1).max(BODY_MAX),
    slug: z.string().min(1).max(60).regex(SLUG_RE, "invalid_slug").optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

async function pickAvailableSlug(workspaceId: string, base: string): Promise<string> {
  const taken = await prisma.agentProfile.findMany({
    where: { workspaceId, slug: { startsWith: base } },
    select: { slug: true },
  });
  const set = new Set(taken.map((t) => t.slug));
  if (!set.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  throw new Error("slug_exhausted");
}

export async function createAgentProfileSvc(
  userId: string,
  input: z.infer<typeof CreateAgentProfileSchema>,
): Promise<ServerActionResult<AgentProfileFull>> {
  try {
    const data = CreateAgentProfileSchema.parse(input);
    await requireMembership(data.workspaceId, userId);
    const baseSlug = data.slug ?? slugify(data.name);
    if (!baseSlug || !SLUG_RE.test(baseSlug)) return { ok: false, error: "invalid_slug" };

    let row: AgentProfileFull | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = await pickAvailableSlug(data.workspaceId, baseSlug);
      try {
        row = await prisma.agentProfile.create({
          data: {
            workspaceId: data.workspaceId,
            name: data.name,
            slug,
            description: data.description ?? null,
            body: data.body,
            isActive: data.isActive ?? true,
            createdById: userId,
          },
          select: FULL_SELECT,
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
    if (!row) return { ok: false, error: "slug_taken" };

    await publishWorkspaceEvent(data.workspaceId, {
      name: "agentProfile.created",
      workspaceId: data.workspaceId,
      profile: stripBody(row),
      by: userId,
    });
    return { ok: true, data: row };
  } catch (e) {
    logger.error("createAgentProfile.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Update ----------------

export const UpdateAgentProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    description: z.string().trim().max(DESC_MAX).nullable().optional(),
    body: z.string().min(1).max(BODY_MAX).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function updateAgentProfileSvc(
  userId: string,
  input: z.infer<typeof UpdateAgentProfileSchema>,
): Promise<ServerActionResult<AgentProfileFull>> {
  try {
    const data = UpdateAgentProfileSchema.parse(input);
    const existing = await prisma.agentProfile.findUnique({
      where: { id: data.id },
      select: { workspaceId: true, name: true, slug: true, archivedAt: true },
    });
    if (!existing) return { ok: false, error: "not_found" };
    await requireMembership(existing.workspaceId, userId);
    if (existing.archivedAt && data.isActive !== true) {
      // allow updates on archived profile only when reactivating
    }

    let nextSlug: string | undefined;
    if (data.name && data.name !== existing.name) {
      const base = slugify(data.name);
      if (!base) return { ok: false, error: "invalid_slug" };
      nextSlug = await pickAvailableSlug(existing.workspaceId, base);
    }

    const updateData: Prisma.AgentProfileUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
      if (data.isActive) updateData.archivedAt = null;
    }
    if (nextSlug) updateData.slug = nextSlug;

    const row = await prisma.agentProfile.update({
      where: { id: data.id },
      data: updateData,
      select: FULL_SELECT,
    });

    await publishWorkspaceEvent(existing.workspaceId, {
      name: "agentProfile.updated",
      workspaceId: existing.workspaceId,
      profile: stripBody(row),
      by: userId,
    });
    return { ok: true, data: row };
  } catch (e) {
    logger.error("updateAgentProfile.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Delete ----------------

export const DeleteAgentProfileSchema = z
  .object({ id: z.string().min(1), purge: z.boolean().optional() })
  .strict();

export async function deleteAgentProfileSvc(
  userId: string,
  input: z.infer<typeof DeleteAgentProfileSchema>,
): Promise<ServerActionResult<{ id: string; purged: boolean }>> {
  try {
    const { id, purge } = DeleteAgentProfileSchema.parse(input);
    const existing = await prisma.agentProfile.findUnique({
      where: { id },
      select: { workspaceId: true, _count: { select: { ticketLinks: true } } },
    });
    if (!existing) return { ok: false, error: "not_found" };
    await requireMembership(existing.workspaceId, userId);

    const canPurge = Boolean(purge) && existing._count.ticketLinks === 0;
    if (canPurge) {
      await prisma.agentProfile.delete({ where: { id } });
    } else {
      await prisma.agentProfile.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date() },
      });
    }

    await publishWorkspaceEvent(existing.workspaceId, {
      name: "agentProfile.deleted",
      workspaceId: existing.workspaceId,
      profileId: id,
      by: userId,
    });
    return { ok: true, data: { id, purged: canPurge } };
  } catch (e) {
    logger.error("deleteAgentProfile.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Ticket assignment ----------------

export const SetTicketAgentProfilesSchema = z
  .object({
    ticketId: z.string().min(1),
    agentProfileIds: z.array(z.string().min(1)).max(50),
  })
  .strict();

export async function setTicketAgentProfilesSvc(
  userId: string,
  input: z.infer<typeof SetTicketAgentProfilesSchema>,
): Promise<ServerActionResult<TicketAgentProfileLink[]>> {
  try {
    const { ticketId, agentProfileIds } = SetTicketAgentProfilesSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const dedup = Array.from(new Set(agentProfileIds));
    if (dedup.length > 0) {
      const found = await prisma.agentProfile.findMany({
        where: { id: { in: dedup }, workspaceId: ticket.workspaceId },
        select: { id: true },
      });
      if (found.length !== dedup.length) return { ok: false, error: "invalid_agent_profile" };
    }

    await prisma.$transaction([
      prisma.ticketAgentProfile.deleteMany({ where: { ticketId } }),
      ...(dedup.length > 0
        ? [
            prisma.ticketAgentProfile.createMany({
              data: dedup.map((agentProfileId, position) => ({
                ticketId,
                agentProfileId,
                position,
              })),
            }),
          ]
        : []),
    ]);

    const links = await prisma.ticketAgentProfile.findMany({
      where: { ticketId },
      orderBy: { position: "asc" },
      select: {
        agentProfileId: true,
        position: true,
        agentProfile: { select: SUMMARY_SELECT },
      },
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.agentProfiles.updated",
      workspaceId: ticket.workspaceId,
      ticketId,
      profileIds: dedup,
      by: userId,
    });

    return {
      ok: true,
      data: links.map((l) => ({
        agentProfileId: l.agentProfileId,
        position: l.position,
        profile: l.agentProfile,
      })),
    };
  } catch (e) {
    logger.error("setTicketAgentProfiles.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listTicketAgentProfilesSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<TicketAgentProfileLink[]>> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);
    const links = await prisma.ticketAgentProfile.findMany({
      where: { ticketId },
      orderBy: { position: "asc" },
      select: {
        agentProfileId: true,
        position: true,
        agentProfile: { select: SUMMARY_SELECT },
      },
    });
    return {
      ok: true,
      data: links.map((l) => ({
        agentProfileId: l.agentProfileId,
        position: l.position,
        profile: l.agentProfile,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function stripBody(row: AgentProfileFull): AgentProfileSummary {
  const { body: _body, ...rest } = row;
  return rest;
}

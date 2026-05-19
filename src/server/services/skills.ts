import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type {
  AgentProfileSkillLink,
  ServerActionResult,
  SkillSummary,
  TicketSkillLink,
} from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_MAX = 60;
const DESC_MAX = 280;

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

const SKILL_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  color: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SkillSelect;

async function pickAvailableSlug(workspaceId: string, base: string): Promise<string> {
  const taken = await prisma.skill.findMany({
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

// ---------------- List ----------------

export const ListSkillsSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function listSkillsSvc(
  userId: string,
  input: z.infer<typeof ListSkillsSchema>,
): Promise<ServerActionResult<SkillSummary[]>> {
  try {
    const { workspaceId } = ListSkillsSchema.parse(input);
    await requireMembership(workspaceId, userId);
    const rows = await prisma.skill.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: SKILL_SELECT,
    });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Create ----------------

export const CreateSkillSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z.string().trim().min(1).max(NAME_MAX),
    description: z.string().trim().max(DESC_MAX).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    slug: z.string().min(1).max(60).regex(SLUG_RE, "invalid_slug").optional(),
  })
  .strict();

export async function createSkillSvc(
  userId: string,
  input: z.infer<typeof CreateSkillSchema>,
): Promise<ServerActionResult<SkillSummary>> {
  try {
    const data = CreateSkillSchema.parse(input);
    await requireMembership(data.workspaceId, userId);
    const baseSlug = data.slug ?? slugify(data.name);
    if (!baseSlug || !SLUG_RE.test(baseSlug)) return { ok: false, error: "invalid_slug" };

    let row: SkillSummary | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = await pickAvailableSlug(data.workspaceId, baseSlug);
      try {
        row = await prisma.skill.create({
          data: {
            workspaceId: data.workspaceId,
            name: data.name,
            slug,
            description: data.description ?? null,
            ...(data.color ? { color: data.color } : {}),
          },
          select: SKILL_SELECT,
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
    if (!row) return { ok: false, error: "slug_taken" };

    await publishWorkspaceEvent(data.workspaceId, {
      name: "skill.created",
      workspaceId: data.workspaceId,
      skill: row,
      by: userId,
    });
    return { ok: true, data: row };
  } catch (e) {
    logger.error("createSkill.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Update ----------------

export const UpdateSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    description: z.string().trim().max(DESC_MAX).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .strict();

export async function updateSkillSvc(
  userId: string,
  input: z.infer<typeof UpdateSkillSchema>,
): Promise<ServerActionResult<SkillSummary>> {
  try {
    const data = UpdateSkillSchema.parse(input);
    const existing = await prisma.skill.findUnique({
      where: { id: data.id },
      select: { workspaceId: true, name: true },
    });
    if (!existing) return { ok: false, error: "not_found" };
    await requireMembership(existing.workspaceId, userId);

    let nextSlug: string | undefined;
    if (data.name && data.name !== existing.name) {
      const base = slugify(data.name);
      if (!base) return { ok: false, error: "invalid_slug" };
      nextSlug = await pickAvailableSlug(existing.workspaceId, base);
    }

    const updateData: Prisma.SkillUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color !== undefined) updateData.color = data.color;
    if (nextSlug) updateData.slug = nextSlug;

    const row = await prisma.skill.update({
      where: { id: data.id },
      data: updateData,
      select: SKILL_SELECT,
    });

    await publishWorkspaceEvent(existing.workspaceId, {
      name: "skill.updated",
      workspaceId: existing.workspaceId,
      skill: row,
      by: userId,
    });
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Delete ----------------

export const DeleteSkillSchema = z.object({ id: z.string().min(1) }).strict();

export async function deleteSkillSvc(
  userId: string,
  input: z.infer<typeof DeleteSkillSchema>,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const { id } = DeleteSkillSchema.parse(input);
    const existing = await prisma.skill.findUnique({
      where: { id },
      select: { workspaceId: true },
    });
    if (!existing) return { ok: false, error: "not_found" };
    await requireMembership(existing.workspaceId, userId);

    await prisma.skill.delete({ where: { id } });

    await publishWorkspaceEvent(existing.workspaceId, {
      name: "skill.deleted",
      workspaceId: existing.workspaceId,
      skillId: id,
      by: userId,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- AgentProfile <-> Skill ----------------

export const SetAgentProfileSkillsSchema = z
  .object({
    agentProfileId: z.string().min(1),
    skills: z
      .array(
        z
          .object({
            skillId: z.string().min(1),
            level: z.number().int().min(1).max(5).nullable().optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export async function setAgentProfileSkillsSvc(
  userId: string,
  input: z.infer<typeof SetAgentProfileSkillsSchema>,
): Promise<ServerActionResult<AgentProfileSkillLink[]>> {
  try {
    const { agentProfileId, skills } = SetAgentProfileSkillsSchema.parse(input);
    const profile = await prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { workspaceId: true },
    });
    if (!profile) return { ok: false, error: "profile_not_found" };
    await requireMembership(profile.workspaceId, userId);

    const skillIds = Array.from(new Set(skills.map((s) => s.skillId)));
    if (skillIds.length > 0) {
      const found = await prisma.skill.findMany({
        where: { id: { in: skillIds }, workspaceId: profile.workspaceId },
        select: { id: true },
      });
      if (found.length !== skillIds.length) return { ok: false, error: "invalid_skill" };
    }

    await prisma.$transaction([
      prisma.agentProfileSkill.deleteMany({ where: { agentProfileId } }),
      ...(skills.length > 0
        ? [
            prisma.agentProfileSkill.createMany({
              data: skills.map((s) => ({
                agentProfileId,
                skillId: s.skillId,
                level: s.level ?? null,
              })),
            }),
          ]
        : []),
    ]);

    const links = await prisma.agentProfileSkill.findMany({
      where: { agentProfileId },
      select: {
        agentProfileId: true,
        skillId: true,
        level: true,
        skill: { select: SKILL_SELECT },
      },
    });

    await publishWorkspaceEvent(profile.workspaceId, {
      name: "agentProfile.skills.updated",
      workspaceId: profile.workspaceId,
      agentProfileId,
      skillIds,
      by: userId,
    });

    return {
      ok: true,
      data: links.map((l) => ({
        agentProfileId: l.agentProfileId,
        skillId: l.skillId,
        level: l.level,
        skill: l.skill,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listAgentProfileSkillsSvc(
  userId: string,
  agentProfileId: string,
): Promise<ServerActionResult<AgentProfileSkillLink[]>> {
  try {
    const profile = await prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { workspaceId: true },
    });
    if (!profile) return { ok: false, error: "profile_not_found" };
    await requireMembership(profile.workspaceId, userId);
    const links = await prisma.agentProfileSkill.findMany({
      where: { agentProfileId },
      select: {
        agentProfileId: true,
        skillId: true,
        level: true,
        skill: { select: SKILL_SELECT },
      },
    });
    return {
      ok: true,
      data: links.map((l) => ({
        agentProfileId: l.agentProfileId,
        skillId: l.skillId,
        level: l.level,
        skill: l.skill,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Ticket <-> Skill ----------------

export const SetTicketSkillsSchema = z
  .object({
    ticketId: z.string().min(1),
    skillIds: z.array(z.string().min(1)).max(50),
  })
  .strict();

export async function setTicketSkillsSvc(
  userId: string,
  input: z.infer<typeof SetTicketSkillsSchema>,
): Promise<ServerActionResult<TicketSkillLink[]>> {
  try {
    const { ticketId, skillIds } = SetTicketSkillsSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const dedup = Array.from(new Set(skillIds));
    if (dedup.length > 0) {
      const found = await prisma.skill.findMany({
        where: { id: { in: dedup }, workspaceId: ticket.workspaceId },
        select: { id: true },
      });
      if (found.length !== dedup.length) return { ok: false, error: "invalid_skill" };
    }

    await prisma.$transaction([
      prisma.ticketSkill.deleteMany({ where: { ticketId } }),
      ...(dedup.length > 0
        ? [
            prisma.ticketSkill.createMany({
              data: dedup.map((skillId) => ({ ticketId, skillId })),
            }),
          ]
        : []),
    ]);

    const links = await prisma.ticketSkill.findMany({
      where: { ticketId },
      select: { skillId: true, skill: { select: SKILL_SELECT } },
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.skills.updated",
      workspaceId: ticket.workspaceId,
      ticketId,
      skillIds: dedup,
      by: userId,
    });

    return {
      ok: true,
      data: links.map((l) => ({ skillId: l.skillId, skill: l.skill })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listTicketSkillsSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<TicketSkillLink[]>> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);
    const links = await prisma.ticketSkill.findMany({
      where: { ticketId },
      select: { skillId: true, skill: { select: SKILL_SELECT } },
    });
    return {
      ok: true,
      data: links.map((l) => ({ skillId: l.skillId, skill: l.skill })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

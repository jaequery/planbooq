import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type {
  ContextDocFull,
  ContextDocKind,
  ContextDocSummary,
  ServerActionResult,
  TicketContextDocLink,
} from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";

const TITLE_MAX = 200;
const BODY_MAX = 200_000;

const KIND_VALUES = [
  "SCOPE",
  "DECISION",
  "ARCHITECTURE",
  "DEPENDENCY",
  "CONSTRAINT",
  "PATTERN",
  "OTHER",
] as const satisfies readonly ContextDocKind[];

const KindSchema = z.enum(KIND_VALUES);

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const m = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!m) throw new Error("forbidden");
}

const SUMMARY_SELECT = {
  id: true,
  workspaceId: true,
  projectId: true,
  title: true,
  kind: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} satisfies Prisma.ContextDocSelect;

const FULL_SELECT = { ...SUMMARY_SELECT, body: true } satisfies Prisma.ContextDocSelect;

// ---------------- List ----------------

export const ListContextDocsSchema = z
  .object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1).nullable().optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();

export async function listContextDocsSvc(
  userId: string,
  input: z.infer<typeof ListContextDocsSchema>,
): Promise<ServerActionResult<ContextDocSummary[]>> {
  try {
    const { workspaceId, projectId, includeArchived } = ListContextDocsSchema.parse(input);
    await requireMembership(workspaceId, userId);
    const rows = await prisma.contextDoc.findMany({
      where: {
        workspaceId,
        ...(projectId === undefined ? {} : { projectId }),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: SUMMARY_SELECT,
    });
    return { ok: true, data: rows };
  } catch (e) {
    logger.error("listContextDocs.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Get ----------------

export const GetContextDocSchema = z.object({ id: z.string().min(1) }).strict();

export async function getContextDocSvc(
  userId: string,
  input: z.infer<typeof GetContextDocSchema>,
): Promise<ServerActionResult<ContextDocFull>> {
  try {
    const { id } = GetContextDocSchema.parse(input);
    const row = await prisma.contextDoc.findUnique({ where: { id }, select: FULL_SELECT });
    if (!row) return { ok: false, error: "not_found" };
    await requireMembership(row.workspaceId, userId);
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Create ----------------

export const CreateContextDocSchema = z
  .object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1).nullable().optional(),
    title: z.string().trim().min(1).max(TITLE_MAX),
    body: z.string().min(1).max(BODY_MAX),
    kind: KindSchema.optional(),
  })
  .strict();

async function nextPosition(workspaceId: string, projectId: string | null): Promise<number> {
  const last = await prisma.contextDoc.findFirst({
    where: { workspaceId, projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1024;
}

export async function createContextDocSvc(
  userId: string,
  input: z.infer<typeof CreateContextDocSchema>,
): Promise<ServerActionResult<ContextDocFull>> {
  try {
    const data = CreateContextDocSchema.parse(input);
    await requireMembership(data.workspaceId, userId);

    const projectId = data.projectId ?? null;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true },
      });
      if (!project || project.workspaceId !== data.workspaceId) {
        return { ok: false, error: "invalid_project" };
      }
    }

    const position = await nextPosition(data.workspaceId, projectId);
    const row = await prisma.contextDoc.create({
      data: {
        workspaceId: data.workspaceId,
        projectId,
        title: data.title,
        body: data.body,
        kind: data.kind ?? "OTHER",
        position,
        createdById: userId,
      },
      select: FULL_SELECT,
    });

    await publishWorkspaceEvent(data.workspaceId, {
      name: "contextDoc.created",
      workspaceId: data.workspaceId,
      doc: stripBody(row),
      by: userId,
    });
    return { ok: true, data: row };
  } catch (e) {
    logger.error("createContextDoc.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Update ----------------

export const UpdateContextDocSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    body: z.string().min(1).max(BODY_MAX).optional(),
    kind: KindSchema.optional(),
    projectId: z.string().min(1).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export async function updateContextDocSvc(
  userId: string,
  input: z.infer<typeof UpdateContextDocSchema>,
): Promise<ServerActionResult<ContextDocFull>> {
  try {
    const data = UpdateContextDocSchema.parse(input);
    const existing = await prisma.contextDoc.findUnique({
      where: { id: data.id },
      select: { workspaceId: true },
    });
    if (!existing) return { ok: false, error: "not_found" };
    await requireMembership(existing.workspaceId, userId);

    if (data.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
        select: { workspaceId: true },
      });
      if (!project || project.workspaceId !== existing.workspaceId) {
        return { ok: false, error: "invalid_project" };
      }
    }

    const updateData: Prisma.ContextDocUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.kind !== undefined) updateData.kind = data.kind;
    if (data.projectId !== undefined) {
      updateData.project = data.projectId
        ? { connect: { id: data.projectId } }
        : { disconnect: true };
    }
    if (data.archived !== undefined) {
      updateData.archivedAt = data.archived ? new Date() : null;
    }

    const row = await prisma.contextDoc.update({
      where: { id: data.id },
      data: updateData,
      select: FULL_SELECT,
    });

    await publishWorkspaceEvent(existing.workspaceId, {
      name: "contextDoc.updated",
      workspaceId: existing.workspaceId,
      doc: stripBody(row),
      by: userId,
    });
    return { ok: true, data: row };
  } catch (e) {
    logger.error("updateContextDoc.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Delete ----------------

export const DeleteContextDocSchema = z.object({ id: z.string().min(1) }).strict();

export async function deleteContextDocSvc(
  userId: string,
  input: z.infer<typeof DeleteContextDocSchema>,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const { id } = DeleteContextDocSchema.parse(input);
    const existing = await prisma.contextDoc.findUnique({
      where: { id },
      select: { workspaceId: true },
    });
    if (!existing) return { ok: false, error: "not_found" };
    await requireMembership(existing.workspaceId, userId);

    await prisma.contextDoc.delete({ where: { id } });

    await publishWorkspaceEvent(existing.workspaceId, {
      name: "contextDoc.deleted",
      workspaceId: existing.workspaceId,
      docId: id,
      by: userId,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    logger.error("deleteContextDoc.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ---------------- Ticket linking ----------------

export const SetTicketContextDocsSchema = z
  .object({
    ticketId: z.string().min(1),
    contextDocIds: z.array(z.string().min(1)).max(100),
  })
  .strict();

export async function setTicketContextDocsSvc(
  userId: string,
  input: z.infer<typeof SetTicketContextDocsSchema>,
): Promise<ServerActionResult<TicketContextDocLink[]>> {
  try {
    const { ticketId, contextDocIds } = SetTicketContextDocsSchema.parse(input);
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);

    const dedup = Array.from(new Set(contextDocIds));
    if (dedup.length > 0) {
      const found = await prisma.contextDoc.findMany({
        where: { id: { in: dedup }, workspaceId: ticket.workspaceId },
        select: { id: true },
      });
      if (found.length !== dedup.length) return { ok: false, error: "invalid_context_doc" };
    }

    await prisma.$transaction([
      prisma.ticketContextDoc.deleteMany({ where: { ticketId } }),
      ...(dedup.length > 0
        ? [
            prisma.ticketContextDoc.createMany({
              data: dedup.map((contextDocId, position) => ({
                ticketId,
                contextDocId,
                position,
              })),
            }),
          ]
        : []),
    ]);

    const links = await prisma.ticketContextDoc.findMany({
      where: { ticketId },
      orderBy: { position: "asc" },
      select: {
        contextDocId: true,
        position: true,
        contextDoc: { select: SUMMARY_SELECT },
      },
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "ticket.contextDocs.updated",
      workspaceId: ticket.workspaceId,
      ticketId,
      contextDocIds: dedup,
      by: userId,
    });

    return {
      ok: true,
      data: links.map((l) => ({
        contextDocId: l.contextDocId,
        position: l.position,
        contextDoc: l.contextDoc,
      })),
    };
  } catch (e) {
    logger.error("setTicketContextDocs.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listTicketContextDocsSvc(
  userId: string,
  ticketId: string,
): Promise<ServerActionResult<TicketContextDocLink[]>> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { workspaceId: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    await requireMembership(ticket.workspaceId, userId);
    const links = await prisma.ticketContextDoc.findMany({
      where: { ticketId },
      orderBy: { position: "asc" },
      select: {
        contextDocId: true,
        position: true,
        contextDoc: { select: SUMMARY_SELECT },
      },
    });
    return {
      ok: true,
      data: links.map((l) => ({
        contextDocId: l.contextDocId,
        position: l.position,
        contextDoc: l.contextDoc,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function stripBody(row: ContextDocFull): ContextDocSummary {
  const { body: _body, ...rest } = row;
  return rest;
}

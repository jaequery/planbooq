import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { type AuthedCaller, assertWorkspaceAccess } from "@/server/api-auth";
import { prisma } from "@/server/db";
import { createAttachment } from "@/server/services/attachment";

export type TicketPreviewRow = {
  id: string;
  attachmentId: string;
  url: string;
  mimeType: string;
  size: number;
  label: string | null;
  position: number;
  createdAt: Date;
};

async function authForTicket(
  caller: AuthedCaller,
  ticketId: string,
): Promise<
  | { ok: true; ticket: { id: string; workspaceId: string; projectId: string } }
  | { ok: false; error: string }
> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, workspaceId: true, projectId: true },
  });
  if (!ticket) return { ok: false, error: "ticket_not_found" };
  const denied = await assertWorkspaceAccess(caller, ticket.workspaceId);
  if (denied) return { ok: false, error: "forbidden" };
  return { ok: true, ticket };
}

export async function listTicketPreviewsSvc(args: {
  caller: AuthedCaller;
  ticketId: string;
}): Promise<ServerActionResult<{ items: TicketPreviewRow[] }>> {
  const { caller, ticketId } = args;
  const auth = await authForTicket(caller, ticketId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const rows = await prisma.ticketPreview.findMany({
    where: { ticketId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      attachment: { select: { id: true, mimeType: true, size: true } },
    },
  });

  const items: TicketPreviewRow[] = rows.map((r) => ({
    id: r.id,
    attachmentId: r.attachmentId,
    url: `/api/attachments/${r.attachmentId}`,
    mimeType: r.attachment.mimeType,
    size: r.attachment.size,
    label: r.label,
    position: r.position,
    createdAt: r.createdAt,
  }));

  return { ok: true, data: { items } };
}

export async function addTicketPreviewSvc(args: {
  caller: AuthedCaller;
  ticketId: string;
  file: { mimeType: string; size: number; data: Buffer };
  label?: string | null;
}): Promise<ServerActionResult<TicketPreviewRow>> {
  const { caller, ticketId, file, label } = args;
  try {
    const auth = await authForTicket(caller, ticketId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const attachment = await createAttachment({
      userId: caller.userId,
      workspaceId: auth.ticket.workspaceId,
      mimeType: file.mimeType,
      size: file.size,
      data: file.data,
    });

    const last = await prisma.ticketPreview.findFirst({
      where: { ticketId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition = (last?.position ?? 0) + 1;

    const safeLabel = label ? label.slice(0, 200) : null;
    const created = await prisma.ticketPreview.create({
      data: {
        ticketId,
        attachmentId: attachment.id,
        label: safeLabel,
        position: nextPosition,
        createdById: caller.userId,
      },
    });

    const row: TicketPreviewRow = {
      id: created.id,
      attachmentId: attachment.id,
      url: attachment.url,
      mimeType: file.mimeType,
      size: file.size,
      label: created.label,
      position: created.position,
      createdAt: created.createdAt,
    };

    await publishWorkspaceEvent(auth.ticket.workspaceId, {
      name: "ticket.preview.added",
      workspaceId: auth.ticket.workspaceId,
      ticketId,
      previewId: created.id,
      attachmentId: attachment.id,
      url: attachment.url,
      mimeType: file.mimeType,
      label: created.label,
      position: created.position,
      by: caller.userId,
    });

    return { ok: true, data: row };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (
      message === "forbidden" ||
      message === "unsupported_mime_type" ||
      message === "file_too_large" ||
      message === "size_mismatch"
    ) {
      return { ok: false, error: message };
    }
    logger.error("addTicketPreviewSvc.failed", { error: message });
    return { ok: false, error: "internal_error" };
  }
}

export async function removeTicketPreviewSvc(args: {
  caller: AuthedCaller;
  ticketId: string;
  previewId: string;
}): Promise<ServerActionResult<{ id: string }>> {
  const { caller, ticketId, previewId } = args;
  try {
    const auth = await authForTicket(caller, ticketId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const preview = await prisma.ticketPreview.findUnique({
      where: { id: previewId },
      select: { id: true, ticketId: true },
    });
    if (!preview || preview.ticketId !== ticketId) {
      return { ok: false, error: "preview_not_found" };
    }

    await prisma.ticketPreview.delete({ where: { id: previewId } });

    await publishWorkspaceEvent(auth.ticket.workspaceId, {
      name: "ticket.preview.removed",
      workspaceId: auth.ticket.workspaceId,
      ticketId,
      previewId,
      by: caller.userId,
    });

    return { ok: true, data: { id: previewId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    logger.error("removeTicketPreviewSvc.failed", { error: message });
    return { ok: false, error: "internal_error" };
  }
}

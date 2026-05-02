import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024;

export function getMaxSizeForMime(mime: string): number | null {
  if (ALLOWED_MIME_TYPES.has(mime)) return MAX_SIZE_BYTES;
  if (ALLOWED_VIDEO_MIME_TYPES.has(mime)) return MAX_VIDEO_SIZE_BYTES;
  return null;
}

export type CreateAttachmentInput = {
  userId: string;
  workspaceId: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

export type CreateAttachmentResult = { id: string; url: string };

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.member.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });
  if (!member) throw new Error("forbidden");
}

export async function createAttachment(
  input: CreateAttachmentInput,
): Promise<CreateAttachmentResult> {
  const { userId, workspaceId, mimeType, size, data } = input;

  const cap = getMaxSizeForMime(mimeType);
  if (cap === null) {
    throw new Error("unsupported_mime_type");
  }
  if (size <= 0 || size > cap) {
    throw new Error("file_too_large");
  }
  if (data.byteLength !== size) {
    throw new Error("size_mismatch");
  }

  await requireMembership(workspaceId, userId);

  const attachment = await prisma.attachment.create({
    data: {
      workspaceId,
      uploaderId: userId,
      mimeType,
      size,
      data: Uint8Array.from(data),
    },
    select: { id: true },
  });

  logger.info("attachment.created", {
    attachmentId: attachment.id,
    workspaceId,
    userId,
    mimeType,
    size,
  });

  return { id: attachment.id, url: `/api/attachments/${attachment.id}` };
}

export type AttachmentBytes = { mimeType: string; data: Buffer; size: number };

export async function getAttachment(
  userId: string,
  attachmentId: string,
): Promise<AttachmentBytes | null> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { workspaceId: true, mimeType: true, data: true, size: true },
  });
  if (!attachment) return null;

  const member = await prisma.member.findFirst({
    where: { workspaceId: attachment.workspaceId, userId },
    select: { id: true },
  });
  if (!member) return null;

  return {
    mimeType: attachment.mimeType,
    data: Buffer.from(attachment.data),
    size: attachment.size,
  };
}

export type AttachmentCaller = { userId: string; workspaceScope: string | null };

export async function getAttachmentForCaller(
  caller: AttachmentCaller,
  attachmentId: string,
): Promise<AttachmentBytes | null> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { workspaceId: true, mimeType: true, data: true, size: true },
  });
  if (!attachment) return null;

  if (caller.workspaceScope && caller.workspaceScope !== attachment.workspaceId) {
    return null;
  }

  const member = await prisma.member.findFirst({
    where: { workspaceId: attachment.workspaceId, userId: caller.userId },
    select: { id: true },
  });
  if (!member) return null;

  return {
    mimeType: attachment.mimeType,
    data: Buffer.from(attachment.data),
    size: attachment.size,
  };
}

export const ATTACHMENT_LIMITS = {
  maxSizeBytes: MAX_SIZE_BYTES,
  maxVideoSizeBytes: MAX_VIDEO_SIZE_BYTES,
  allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  allowedVideoMimeTypes: Array.from(ALLOWED_VIDEO_MIME_TYPES),
} as const;

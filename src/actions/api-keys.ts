"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { hashApiKey } from "@/server/api-auth";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

const KEY_PREFIX = "pbq_live_";

async function requireSessionUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

async function requireMembership(workspaceId: string, userId: string): Promise<void> {
  const m = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!m) throw new Error("forbidden");
}

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

const ListSchema = z.object({ workspaceId: z.string().min(1) }).strict();

export async function listApiKeys(
  input: z.infer<typeof ListSchema>,
): Promise<ServerActionResult<ApiKeySummary[]>> {
  try {
    const { workspaceId } = ListSchema.parse(input);
    const userId = await requireSessionUser();
    await requireMembership(workspaceId, userId);
    const keys = await prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return { ok: true, data: keys };
  } catch (e) {
    logger.error("listApiKeys.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const CreateSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z
      .string()
      .min(1)
      .max(64)
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "name_empty"),
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict();

export async function createApiKey(
  input: z.infer<typeof CreateSchema>,
): Promise<ServerActionResult<{ id: string; name: string; token: string; prefix: string }>> {
  try {
    const data = CreateSchema.parse(input);
    const userId = await requireSessionUser();
    await requireMembership(data.workspaceId, userId);

    const secret = randomBytes(16).toString("hex"); // 32 hex chars
    const token = `${KEY_PREFIX}${secret}`;
    const prefix = token.slice(0, 16);
    const hash = hashApiKey(token);
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const created = await prisma.apiKey.create({
      data: {
        workspaceId: data.workspaceId,
        userId,
        name: data.name,
        prefix,
        hash,
        expiresAt,
      },
      select: { id: true, name: true, prefix: true },
    });

    revalidatePath("/settings/api-keys");
    return { ok: true, data: { id: created.id, name: created.name, prefix, token } };
  } catch (e) {
    logger.error("createApiKey.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const MintAgentSchema = z.object({ workspaceId: z.string().min(1) }).strict();

// Mints a short-lived API key for a Claude Code session spawned from the desktop app.
// Each spawn gets a fresh token so revoking one session doesn't break the others.
export async function mintAgentApiKey(
  input: z.infer<typeof MintAgentSchema>,
): Promise<ServerActionResult<{ token: string; expiresAt: Date }>> {
  try {
    const { workspaceId } = MintAgentSchema.parse(input);
    const userId = await requireSessionUser();
    await requireMembership(workspaceId, userId);

    const secret = randomBytes(16).toString("hex");
    const token = `${KEY_PREFIX}${secret}`;
    const prefix = token.slice(0, 16);
    const hash = hashApiKey(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.apiKey.create({
      data: {
        workspaceId,
        userId,
        name: `Claude Code agent · ${new Date().toISOString().slice(0, 10)}`,
        prefix,
        hash,
        expiresAt,
      },
    });
    return { ok: true, data: { token, expiresAt } };
  } catch (e) {
    logger.error("mintAgentApiKey.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const RevokeSchema = z.object({ keyId: z.string().min(1) }).strict();

export async function revokeApiKey(
  input: z.infer<typeof RevokeSchema>,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const { keyId } = RevokeSchema.parse(input);
    const userId = await requireSessionUser();
    const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key) return { ok: true, data: { id: keyId } };
    await requireMembership(key.workspaceId, userId);
    await prisma.apiKey.delete({ where: { id: keyId } });
    revalidatePath("/settings/api-keys");
    return { ok: true, data: { id: keyId } };
  } catch (e) {
    logger.error("revokeApiKey.failed", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { isValidOpenRouterKeyShape } from "@/server/openrouter";

export type OpenRouterKeyStatus = { configured: boolean; last4: string | null };

async function requireWorkspaceOwner(workspaceId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member || member.role !== "OWNER") throw new Error("forbidden");
}

const WorkspaceInput = z.object({ workspaceId: z.string().min(1) }).strict();

export async function getOpenRouterKeyStatus(
  input: z.infer<typeof WorkspaceInput>,
): Promise<ServerActionResult<OpenRouterKeyStatus>> {
  try {
    const { workspaceId } = WorkspaceInput.parse(input);
    await requireWorkspaceOwner(workspaceId);
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { openrouterKeyCiphertext: true, openrouterKeyLast4: true },
    });
    return {
      ok: true,
      data: {
        configured: Boolean(ws?.openrouterKeyCiphertext),
        last4: ws?.openrouterKeyLast4 ?? null,
      },
    };
  } catch (e) {
    logger.error("getOpenRouterKeyStatus.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const SetSchema = z
  .object({
    workspaceId: z.string().min(1),
    apiKey: z.string().min(20).max(512),
  })
  .strict();

export async function setOpenRouterKey(
  input: z.infer<typeof SetSchema>,
): Promise<ServerActionResult<OpenRouterKeyStatus>> {
  try {
    const { workspaceId, apiKey } = SetSchema.parse(input);
    await requireWorkspaceOwner(workspaceId);
    const trimmed = apiKey.trim();
    if (!isValidOpenRouterKeyShape(trimmed)) return { ok: false, error: "invalid_key_shape" };

    const ciphertext = encryptSecret(trimmed);
    const last4 = trimmed.slice(-4);

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { openrouterKeyCiphertext: ciphertext, openrouterKeyLast4: last4 },
    });

    revalidatePath("/settings/openrouter");
    return { ok: true, data: { configured: true, last4 } };
  } catch (e) {
    logger.error("setOpenRouterKey.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function removeOpenRouterKey(
  input: z.infer<typeof WorkspaceInput>,
): Promise<ServerActionResult<OpenRouterKeyStatus>> {
  try {
    const { workspaceId } = WorkspaceInput.parse(input);
    await requireWorkspaceOwner(workspaceId);
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { openrouterKeyCiphertext: null, openrouterKeyLast4: null },
    });
    revalidatePath("/settings/openrouter");
    return { ok: true, data: { configured: false, last4: null } };
  } catch (e) {
    logger.error("removeOpenRouterKey.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

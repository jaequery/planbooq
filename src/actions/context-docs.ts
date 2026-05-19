"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type {
  ContextDocFull,
  ContextDocSummary,
  ServerActionResult,
  TicketContextDocLink,
} from "@/lib/types";
import { auth } from "@/server/auth";
import {
  type CreateContextDocSchema,
  createContextDocSvc,
  type DeleteContextDocSchema,
  deleteContextDocSvc,
  type GetContextDocSchema,
  getContextDocSvc,
  type ListContextDocsSchema,
  listContextDocsSvc,
  listTicketContextDocsSvc,
  type SetTicketContextDocsSchema,
  setTicketContextDocsSvc,
  type UpdateContextDocSchema,
  updateContextDocSvc,
} from "@/server/services/context-docs";

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function listContextDocs(
  input: z.infer<typeof ListContextDocsSchema>,
): Promise<ServerActionResult<ContextDocSummary[]>> {
  try {
    const userId = await requireUser();
    return await listContextDocsSvc(userId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function getContextDoc(
  input: z.infer<typeof GetContextDocSchema>,
): Promise<ServerActionResult<ContextDocFull>> {
  try {
    const userId = await requireUser();
    return await getContextDocSvc(userId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function createContextDoc(
  input: z.infer<typeof CreateContextDocSchema>,
): Promise<ServerActionResult<ContextDocFull>> {
  try {
    const userId = await requireUser();
    const r = await createContextDocSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function updateContextDoc(
  input: z.infer<typeof UpdateContextDocSchema>,
): Promise<ServerActionResult<ContextDocFull>> {
  try {
    const userId = await requireUser();
    const r = await updateContextDocSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function deleteContextDoc(
  input: z.infer<typeof DeleteContextDocSchema>,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const userId = await requireUser();
    const r = await deleteContextDocSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function setTicketContextDocs(
  input: z.infer<typeof SetTicketContextDocsSchema>,
): Promise<ServerActionResult<TicketContextDocLink[]>> {
  try {
    const userId = await requireUser();
    const r = await setTicketContextDocsSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listTicketContextDocs(
  ticketId: string,
): Promise<ServerActionResult<TicketContextDocLink[]>> {
  try {
    const userId = await requireUser();
    return await listTicketContextDocsSvc(userId, ticketId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type {
  AgentProfileFull,
  AgentProfileSummary,
  ServerActionResult,
  TicketAgentProfileLink,
} from "@/lib/types";
import { auth } from "@/server/auth";
import {
  type CreateAgentProfileSchema,
  createAgentProfileSvc,
  type DeleteAgentProfileSchema,
  deleteAgentProfileSvc,
  type GetAgentProfileSchema,
  getAgentProfileSvc,
  type ListAgentProfilesSchema,
  listAgentProfilesSvc,
  listTicketAgentProfilesSvc,
  type SetTicketAgentProfilesSchema,
  setTicketAgentProfilesSvc,
  type UpdateAgentProfileSchema,
  updateAgentProfileSvc,
} from "@/server/services/agent-profiles";

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function listAgentProfiles(
  input: z.infer<typeof ListAgentProfilesSchema>,
): Promise<ServerActionResult<AgentProfileSummary[]>> {
  try {
    const userId = await requireUser();
    return await listAgentProfilesSvc(userId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function getAgentProfile(
  input: z.infer<typeof GetAgentProfileSchema>,
): Promise<ServerActionResult<AgentProfileFull>> {
  try {
    const userId = await requireUser();
    return await getAgentProfileSvc(userId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function createAgentProfile(
  input: z.infer<typeof CreateAgentProfileSchema>,
): Promise<ServerActionResult<AgentProfileFull>> {
  try {
    const userId = await requireUser();
    const r = await createAgentProfileSvc(userId, input);
    if (r.ok) revalidatePath("/settings");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function updateAgentProfile(
  input: z.infer<typeof UpdateAgentProfileSchema>,
): Promise<ServerActionResult<AgentProfileFull>> {
  try {
    const userId = await requireUser();
    const r = await updateAgentProfileSvc(userId, input);
    if (r.ok) revalidatePath("/settings");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function deleteAgentProfile(
  input: z.infer<typeof DeleteAgentProfileSchema>,
): Promise<ServerActionResult<{ id: string; purged: boolean }>> {
  try {
    const userId = await requireUser();
    const r = await deleteAgentProfileSvc(userId, input);
    if (r.ok) revalidatePath("/settings");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listTicketAgentProfiles(input: {
  ticketId: string;
}): Promise<ServerActionResult<TicketAgentProfileLink[]>> {
  try {
    const userId = await requireUser();
    return await listTicketAgentProfilesSvc(userId, input.ticketId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function setTicketAgentProfiles(
  input: z.infer<typeof SetTicketAgentProfilesSchema>,
): Promise<ServerActionResult<TicketAgentProfileLink[]>> {
  try {
    const userId = await requireUser();
    return await setTicketAgentProfilesSvc(userId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

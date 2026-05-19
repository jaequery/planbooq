"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type {
  AgentProfileSkillLink,
  ServerActionResult,
  SkillSummary,
  TicketSkillLink,
} from "@/lib/types";
import { auth } from "@/server/auth";
import {
  type CreateSkillSchema,
  createSkillSvc,
  type DeleteSkillSchema,
  deleteSkillSvc,
  type ListSkillsSchema,
  listAgentProfileSkillsSvc,
  listSkillsSvc,
  listTicketSkillsSvc,
  type SetAgentProfileSkillsSchema,
  type SetTicketSkillsSchema,
  setAgentProfileSkillsSvc,
  setTicketSkillsSvc,
  type UpdateSkillSchema,
  updateSkillSvc,
} from "@/server/services/skills";

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function listSkills(
  input: z.infer<typeof ListSkillsSchema>,
): Promise<ServerActionResult<SkillSummary[]>> {
  try {
    const userId = await requireUser();
    return await listSkillsSvc(userId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function createSkill(
  input: z.infer<typeof CreateSkillSchema>,
): Promise<ServerActionResult<SkillSummary>> {
  try {
    const userId = await requireUser();
    const r = await createSkillSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function updateSkill(
  input: z.infer<typeof UpdateSkillSchema>,
): Promise<ServerActionResult<SkillSummary>> {
  try {
    const userId = await requireUser();
    const r = await updateSkillSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function deleteSkill(
  input: z.infer<typeof DeleteSkillSchema>,
): Promise<ServerActionResult<{ id: string }>> {
  try {
    const userId = await requireUser();
    const r = await deleteSkillSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function setAgentProfileSkills(
  input: z.infer<typeof SetAgentProfileSkillsSchema>,
): Promise<ServerActionResult<AgentProfileSkillLink[]>> {
  try {
    const userId = await requireUser();
    const r = await setAgentProfileSkillsSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listAgentProfileSkills(
  agentProfileId: string,
): Promise<ServerActionResult<AgentProfileSkillLink[]>> {
  try {
    const userId = await requireUser();
    return await listAgentProfileSkillsSvc(userId, agentProfileId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function setTicketSkills(
  input: z.infer<typeof SetTicketSkillsSchema>,
): Promise<ServerActionResult<TicketSkillLink[]>> {
  try {
    const userId = await requireUser();
    const r = await setTicketSkillsSvc(userId, input);
    if (r.ok) revalidatePath("/");
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function listTicketSkills(
  ticketId: string,
): Promise<ServerActionResult<TicketSkillLink[]>> {
  try {
    const userId = await requireUser();
    return await listTicketSkillsSvc(userId, ticketId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

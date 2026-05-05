import "server-only";

import * as Ably from "ably";

import { env } from "@/env";
import { logger } from "@/lib/logger";
import type { AblyChannelEvent } from "@/lib/types";

let restClient: Ably.Rest | null = null;

function getClient(): Ably.Rest | null {
  if (!env.ABLY_API_KEY) return null;
  if (!restClient) {
    restClient = new Ably.Rest({ key: env.ABLY_API_KEY });
  }
  return restClient;
}

export function workspaceChannelName(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function agentChannelName(agentId: string): string {
  return `agent:${agentId}`;
}

export async function createAgentTokenRequest(agentId: string): Promise<Ably.TokenRequest | null> {
  const client = getClient();
  if (!client) return null;
  const channel = agentChannelName(agentId);
  return client.auth.createTokenRequest({
    clientId: `agent:${agentId}`,
    capability: { [channel]: ["subscribe", "publish"] },
  });
}

export async function publishAgentEvent(
  agentId: string,
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const channel = client.channels.get(agentChannelName(agentId));
    await channel.publish(name, data);
  } catch (error) {
    logger.error("ably.agent.publish.failed", {
      agentId,
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Issues an Ably TokenRequest scoped to a specific workspace channel.
 * Caller MUST verify membership before calling.
 * Returns null when ABLY_API_KEY is not configured (dev fail-soft).
 */
export async function createTokenRequest(
  workspaceId: string,
  userId: string,
): Promise<Ably.TokenRequest | null> {
  const client = getClient();
  if (!client) {
    logger.warn("ably.token.skipped", { reason: "ABLY_API_KEY not set" });
    return null;
  }

  const channel = workspaceChannelName(workspaceId);
  return client.auth.createTokenRequest({
    clientId: userId,
    capability: { [channel]: ["subscribe"] },
  });
}

/**
 * Server-side broadcast helper. No-ops if Ably is not configured.
 */
export async function publishWorkspaceEvent(
  workspaceId: string,
  event: AblyChannelEvent,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const channel = client.channels.get(workspaceChannelName(workspaceId));
    await channel.publish(event.name, event);
  } catch (error) {
    logger.error("ably.publish.failed", {
      workspaceId,
      eventName: event.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

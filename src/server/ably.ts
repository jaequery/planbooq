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

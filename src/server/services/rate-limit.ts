import "server-only";

// Simple in-memory token bucket. Single-process only — swap for a Redis-backed
// implementation (e.g. Upstash) when the app runs in more than one instance.
// Until then, an attacker can blow past the per-user limit by hitting multiple
// app instances behind a load balancer; for a pre-revenue single-VM deploy
// this is acceptable.

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  capacity: number;
  refillPerSec: number;
};

const MENTION_DISPATCH: RateLimitConfig = {
  // 10 dispatches buffered, refilled at 1 every 6s (~10/min sustained).
  capacity: 10,
  refillPerSec: 1 / 6,
};

export function checkAndConsume(key: string, cfg: RateLimitConfig = MENTION_DISPATCH): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: cfg.capacity - 1, updatedAt: now });
    return true;
  }
  const elapsedSec = (now - existing.updatedAt) / 1000;
  const refilled = Math.min(cfg.capacity, existing.tokens + elapsedSec * cfg.refillPerSec);
  if (refilled < 1) {
    existing.tokens = refilled;
    existing.updatedAt = now;
    return false;
  }
  existing.tokens = refilled - 1;
  existing.updatedAt = now;
  return true;
}

export function mentionDispatchKey(workspaceId: string, userId: string): string {
  return `mention-dispatch:${workspaceId}:${userId}`;
}

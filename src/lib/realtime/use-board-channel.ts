"use client";

import * as Ably from "ably";
import { useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { AblyChannelEvent } from "@/lib/types";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "offline" | "disabled" | "error";

type UseBoardChannelResult = {
  status: RealtimeStatus;
  clientId: string | null;
};

type EventSubscriber = (event: AblyChannelEvent, fromClientId: string | null) => void;
type StatusSubscriber = (snapshot: Pick<UseBoardChannelResult, "status" | "clientId">) => void;

type WorkspaceConnection = {
  workspaceId: string;
  realtime: Ably.Realtime | null;
  channel: Ably.RealtimeChannel | null;
  status: RealtimeStatus;
  clientId: string | null;
  disabled: boolean;
  eventSubscribers: Set<EventSubscriber>;
  statusSubscribers: Set<StatusSubscriber>;
  refCount: number;
};

const connections = new Map<string, WorkspaceConnection>();

function setSnapshot(
  entry: WorkspaceConnection,
  status: RealtimeStatus,
  clientId = entry.clientId,
): void {
  const wasRecovering = entry.status === "offline" || entry.status === "error";
  entry.status = status;
  entry.clientId = clientId;
  for (const subscriber of entry.statusSubscribers) {
    subscriber({ status, clientId });
  }
  if (status === "connected" && wasRecovering) {
    window.dispatchEvent(
      new CustomEvent("planbooq:realtime-recovered", {
        detail: { workspaceId: entry.workspaceId },
      }),
    );
  }
}

function getOrCreateConnection(workspaceId: string): WorkspaceConnection {
  const existing = connections.get(workspaceId);
  if (existing) return existing;

  const entry: WorkspaceConnection = {
    workspaceId,
    realtime: null,
    channel: null,
    status: "idle",
    clientId: null,
    disabled: false,
    eventSubscribers: new Set(),
    statusSubscribers: new Set(),
    refCount: 0,
  };
  connections.set(workspaceId, entry);

  setSnapshot(entry, "connecting", null);
  const realtime = new Ably.Realtime({
    authCallback: (_params, callback) => {
      fetch("/api/ably/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
        .then(async (res) => {
          if (res.status === 503) {
            entry.disabled = true;
            setSnapshot(entry, "disabled", null);
            callback("ably_not_configured", null);
            return;
          }
          if (!res.ok) {
            throw new Error(`token_${res.status}`);
          }
          const tokenRequest = (await res.json()) as Ably.TokenRequest;
          callback(null, tokenRequest);
        })
        .catch((err: unknown) => {
          callback(err instanceof Error ? err.message : "token_error", null);
        });
    },
  });
  entry.realtime = realtime;

  realtime.connection.on((stateChange) => {
    if (entry.disabled) {
      setSnapshot(entry, "disabled", null);
      return;
    }
    const current = stateChange.current;
    if (current === "connected") {
      setSnapshot(entry, "connected", realtime.auth.clientId ?? null);
    } else if (current === "connecting") {
      setSnapshot(entry, "connecting");
    } else if (current === "failed") {
      setSnapshot(entry, "error");
    } else if (current === "disconnected" || current === "suspended" || current === "closed") {
      setSnapshot(entry, "offline");
    }
  });

  const channel = realtime.channels.get(`workspace:${workspaceId}`);
  entry.channel = channel;
  channel
    .subscribe((message) => {
      const data = message.data as AblyChannelEvent | undefined;
      if (!data || typeof data !== "object" || !("name" in data)) return;
      if (data.workspaceId !== workspaceId) {
        logger.warn("realtime.workspace_mismatch", {
          expected: workspaceId,
          received: data.workspaceId,
        });
        return;
      }
      for (const subscriber of entry.eventSubscribers) {
        subscriber(data, message.clientId ?? null);
      }
    })
    .catch((err: unknown) => {
      if (entry.disabled) return;
      const message = err instanceof Error ? err.message : String(err);
      if (/closed|closing/i.test(message)) return;
      logger.warn("realtime.subscribe_failed", { error: message });
    });

  return entry;
}

function releaseConnection(workspaceId: string, entry: WorkspaceConnection): void {
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  connections.delete(workspaceId);
  try {
    entry.channel?.unsubscribe();
  } catch {}
  try {
    entry.realtime?.close();
  } catch {}
}

export function useBoardChannel(
  workspaceId: string,
  onEvent: (event: AblyChannelEvent, fromClientId: string | null) => void,
): UseBoardChannelResult {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [clientId, setClientId] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const entry = getOrCreateConnection(workspaceId);
    entry.refCount += 1;

    const eventSubscriber: EventSubscriber = (event, fromClientId) => {
      onEventRef.current(event, fromClientId);
    };
    const statusSubscriber: StatusSubscriber = (snapshot) => {
      setStatus(snapshot.status);
      setClientId(snapshot.clientId);
    };
    entry.eventSubscribers.add(eventSubscriber);
    entry.statusSubscribers.add(statusSubscriber);
    statusSubscriber({ status: entry.status, clientId: entry.clientId });

    return () => {
      entry.eventSubscribers.delete(eventSubscriber);
      entry.statusSubscribers.delete(statusSubscriber);
      releaseConnection(workspaceId, entry);
    };
  }, [workspaceId]);

  return { status, clientId };
}

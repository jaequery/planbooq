"use client";

import * as Ably from "ably";
import { useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { AblyChannelEvent } from "@/lib/types";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "offline" | "disabled";

type UseBoardChannelResult = {
  status: RealtimeStatus;
  clientId: string | null;
};

export function useBoardChannel(
  workspaceId: string,
  onEvent: (event: AblyChannelEvent, fromClientId: string | null) => void,
): UseBoardChannelResult {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [clientId, setClientId] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    let realtime: Ably.Realtime | null = null;
    let channel: Ably.RealtimeChannel | null = null;

    setStatus("connecting");

    const init = async (): Promise<void> => {
      // Probe the token endpoint once to detect "Ably not configured" without
      // letting Ably's authCallback machinery spin in the background.
      const probe = await fetch("/api/ably/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (cancelled) return;
      if (probe.status === 503) {
        setStatus("disabled");
        return;
      }
      if (!probe.ok) {
        setStatus("offline");
        return;
      }

      realtime = new Ably.Realtime({
        authCallback: (_params, callback) => {
          fetch("/api/ably/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId }),
          })
            .then(async (res) => {
              if (!res.ok) throw new Error(`token_${res.status}`);
              const tokenRequest = (await res.json()) as Ably.TokenRequest;
              callback(null, tokenRequest);
            })
            .catch((err: unknown) => {
              callback(err instanceof Error ? err.message : "token_error", null);
            });
        },
      });

      realtime.connection.on((stateChange) => {
        if (cancelled) return;
        if (stateChange.current === "connected") {
          setStatus("connected");
          setClientId(realtime?.auth.clientId ?? null);
        } else if (
          stateChange.current === "disconnected" ||
          stateChange.current === "suspended" ||
          stateChange.current === "failed" ||
          stateChange.current === "closed"
        ) {
          setStatus("offline");
        } else if (stateChange.current === "connecting") {
          setStatus("connecting");
        }
      });

      channel = realtime.channels.get(`workspace:${workspaceId}`);
      channel.subscribe((message) => {
        const data = message.data as AblyChannelEvent | undefined;
        if (!data || typeof data !== "object" || !("name" in data)) return;
        if (data.workspaceId !== workspaceId) {
          logger.warn("realtime.workspace_mismatch", {
            expected: workspaceId,
            received: data.workspaceId,
          });
          return;
        }
        onEventRef.current(data, message.clientId ?? null);
      });
    };

    void init();

    return () => {
      cancelled = true;
      if (channel) channel.unsubscribe();
      if (realtime) realtime.close();
    };
  }, [workspaceId]);

  return { status, clientId };
}

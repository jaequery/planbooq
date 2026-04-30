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
    // Set by the authCallback when the server reports Ably is unconfigured.
    // Read by the connection state handler so we publish "disabled" instead of
    // the transient "failed" state Ably emits when auth returns null.
    let disabled = false;

    setStatus("connecting");

    realtime = new Ably.Realtime({
      authCallback: (_params, callback) => {
        fetch("/api/ably/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        })
          .then(async (res) => {
            if (res.status === 503) {
              disabled = true;
              if (!cancelled) setStatus("disabled");
              // Signal Ably to stop trying. It will move to a failed/closed
              // state, which we map back to "disabled" via the flag above.
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

    realtime.connection.on((stateChange) => {
      if (cancelled) return;
      if (disabled) {
        setStatus("disabled");
        return;
      }
      const current = stateChange.current;
      if (current === "connected") {
        setStatus("connected");
        setClientId(realtime?.auth.clientId ?? null);
      } else if (current === "connecting") {
        setStatus("connecting");
      } else if (current === "failed") {
        setStatus("error");
      } else if (current === "disconnected" || current === "suspended" || current === "closed") {
        setStatus("offline");
      }
    });

    channel = realtime.channels.get(`workspace:${workspaceId}`);
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
        onEventRef.current(data, message.clientId ?? null);
      })
      .catch((err: unknown) => {
        // Suppress benign races: the effect was torn down (StrictMode/HMR/nav)
        // or auth returned null because Ably isn't configured. In both cases
        // Ably rejects the pending subscribe with a "closed" error.
        if (cancelled || disabled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (/closed|closing/i.test(message)) return;
        logger.warn("realtime.subscribe_failed", { error: message });
      });

    return () => {
      cancelled = true;
      try {
        if (channel) channel.unsubscribe();
      } catch {}
      try {
        if (realtime) realtime.close();
      } catch {}
    };
  }, [workspaceId]);

  return { status, clientId };
}

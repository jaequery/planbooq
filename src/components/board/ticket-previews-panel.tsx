"use client";

import { useCallback, useEffect, useState } from "react";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import { friendlyError, toast } from "@/lib/toast";
import type { AblyChannelEvent } from "@/lib/types";

type TicketPreview = {
  id: string;
  attachmentId: string;
  url: string;
  mimeType: string;
  size: number;
  label: string | null;
  position: number;
  createdAt: string;
};

type Props = {
  ticketId: string;
  workspaceId: string;
};

function sortPreviews(items: TicketPreview[]): TicketPreview[] {
  return [...items].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function TicketPreviewsPanel({ ticketId, workspaceId }: Props): React.ReactElement {
  const [items, setItems] = useState<TicketPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const handleTakeScreenshots = useCallback(async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/screenshots`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `status_${res.status}`);
      }
      toast.success("Screenshot capture started");
    } catch (err) {
      const code = err instanceof Error ? err.message : "request_failed";
      setCaptureError(code);
      toast.error(`Could not start screenshots: ${friendlyError(code)}`);
      setCapturing(false);
    }
  }, [ticketId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/v1/tickets/${ticketId}/previews`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status_${res.status}`);
        return res.json() as Promise<{ ok: boolean; data: { items: TicketPreview[] } }>;
      })
      .then((body) => {
        if (!alive || !body.ok) return;
        setItems(sortPreviews(body.data.items));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ticketId]);

  const handleEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name === "ticket.preview.added" && event.ticketId === ticketId) {
        const added: TicketPreview = {
          id: event.previewId,
          attachmentId: event.attachmentId,
          url: event.url,
          mimeType: event.mimeType,
          size: 0,
          label: event.label,
          position: event.position,
          createdAt: new Date().toISOString(),
        };
        setItems((prev) =>
          prev.some((p) => p.id === added.id) ? prev : sortPreviews([...prev, added]),
        );
        return;
      }
      if (event.name === "ticket.preview.removed" && event.ticketId === ticketId) {
        setItems((prev) => prev.filter((p) => p.id !== event.previewId));
      }
    },
    [ticketId],
  );

  useBoardChannel(workspaceId, handleEvent);

  return (
    <div className="flex flex-col gap-2 pt-2">
      <span className="text-[12px] text-muted-foreground">Previews</span>
      {loading ? (
        <div className="h-[120px] w-full animate-pulse rounded-md bg-muted" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={handleTakeScreenshots}
            disabled={capturing}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-[12px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {capturing ? "Taking screenshots…" : "Take Screenshots"}
          </button>
          {capturing && !captureError ? (
            <div className="text-[12px] text-muted-foreground">
              Queued — previews will appear here when ready.
            </div>
          ) : null}
          {captureError ? (
            <div className="text-[12px] text-destructive">
              Failed to start screenshots: {captureError}
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => (
            <li key={p.id} className="flex flex-col gap-1">
              {p.mimeType.startsWith("image/") ? (
                <img
                  src={p.url}
                  alt={p.label ?? ""}
                  loading="lazy"
                  className="w-full rounded-md border border-border"
                />
              ) : p.mimeType.startsWith("video/") ? (
                <video
                  src={p.url}
                  controls
                  preload="metadata"
                  className="w-full rounded-md border border-border"
                >
                  <track kind="captions" />
                </video>
              ) : null}
              {p.label ? (
                <span className="text-[12px] text-muted-foreground">{p.label}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

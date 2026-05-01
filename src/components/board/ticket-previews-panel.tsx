"use client";

import { useCallback, useEffect, useState } from "react";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
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
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetch(`/api/v1/tickets/${ticketId}/previews`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status_${res.status}`);
        return res.json() as Promise<{ ok: boolean; data: { items: TicketPreview[] } }>;
      })
      .then((body) => {
        if (!alive) return;
        if (!body.ok) {
          setError(true);
          return;
        }
        setItems(sortPreviews(body.data.items));
      })
      .catch(() => {
        if (alive) setError(true);
      })
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
      ) : error ? (
        <div className="text-[12px] text-red-600 dark:text-red-400">
          Couldn&apos;t load previews.
        </div>
      ) : items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No previews yet.</div>
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

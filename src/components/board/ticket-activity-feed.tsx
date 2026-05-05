"use client";

import { CheckCircle2, GitCommit, GitPullRequest, Hammer, MessageSquare, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";

type ActivityKind = "PR_CREATED" | "COMMIT_PUSHED" | "TEST_RUN" | "BUILD" | "NOTE";

type Activity = {
  id: string;
  kind: ActivityKind;
  payload: Record<string, unknown>;
  jobId: string | null;
  createdAt: string;
};

type Props = { ticketId: string; workspaceId: string };

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function renderActivity(a: Activity): React.ReactElement {
  const p = a.payload;
  switch (a.kind) {
    case "PR_CREATED": {
      const url = typeof p.url === "string" ? p.url : null;
      return (
        <span className="inline-flex items-center gap-1.5">
          <GitPullRequest className="size-3.5 shrink-0 text-purple-500" />
          <span>PR opened</span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-blue-500 hover:underline"
            >
              {url.replace(/^https:\/\/github\.com\//, "")}
            </a>
          )}
        </span>
      );
    }
    case "COMMIT_PUSHED": {
      const branch = typeof p.branch === "string" ? p.branch : null;
      return (
        <span className="inline-flex items-center gap-1.5">
          <GitCommit className="size-3.5 shrink-0 text-emerald-500" />
          <span>Pushed{branch ? ` to ${branch}` : ""}</span>
        </span>
      );
    }
    case "TEST_RUN": {
      const passed = p.passed === true;
      return (
        <span className="inline-flex items-center gap-1.5">
          {passed ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="size-3.5 shrink-0 text-red-500" />
          )}
          <span>{passed ? "Tests passed" : "Tests failed"}</span>
        </span>
      );
    }
    case "BUILD": {
      const passed = p.passed === true;
      return (
        <span className="inline-flex items-center gap-1.5">
          <Hammer className="size-3.5 shrink-0 text-amber-500" />
          <span>{passed ? "Build succeeded" : "Build failed"}</span>
        </span>
      );
    }
    case "NOTE":
    default:
      return (
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
          <span>{typeof p.text === "string" ? p.text : "Update"}</span>
        </span>
      );
  }
}

export function TicketActivityFeed({ ticketId, workspaceId }: Props): React.ReactElement | null {
  const [items, setItems] = useState<Activity[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tickets/${ticketId}/activity`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (alive && b.ok) setItems(b.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticketId]);

  const onEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name !== "ticket.activity" || event.ticketId !== ticketId) return;
      setItems((prev) =>
        prev.some((a) => a.id === event.activity.id) ? prev : [event.activity, ...prev],
      );
    },
    [ticketId],
  );
  useBoardChannel(workspaceId, onEvent);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium">Activity</h3>
      <ul className="flex flex-col gap-1 rounded border bg-muted/10 p-2 text-[12px]">
        {items.slice(0, 10).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            {renderActivity(a)}
            <span className="text-[10px] text-muted-foreground">{formatTime(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import type { RealtimeStatus } from "@/lib/realtime/use-board-channel";
import { cn } from "@/lib/utils";

const labels: Record<Exclude<RealtimeStatus, "connected" | "idle">, string> = {
  connecting: "Reconnecting…",
  offline: "Offline",
  disabled: "Live updates off",
  error: "Connection error",
};

const colors: Record<Exclude<RealtimeStatus, "connected" | "idle">, string> = {
  connecting: "bg-amber-400 animate-pulse",
  offline: "bg-rose-500",
  disabled: "bg-muted-foreground/30",
  error: "bg-rose-500",
};

export function RealtimeIndicator({
  status,
}: {
  status: RealtimeStatus;
}): React.ReactElement | null {
  if (status === "connected" || status === "idle") return null;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", colors[status])} />
      <span>{labels[status]}</span>
    </div>
  );
}

"use client";

import type { RealtimeStatus } from "@/lib/realtime/use-board-channel";
import { cn } from "@/lib/utils";

const labels: Record<RealtimeStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Realtime",
  offline: "Offline",
  disabled: "Realtime off",
};

const colors: Record<RealtimeStatus, string> = {
  idle: "bg-muted-foreground/40",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-500",
  offline: "bg-rose-500",
  disabled: "bg-muted-foreground/30",
};

export function RealtimeIndicator({ status }: { status: RealtimeStatus }): React.ReactElement {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", colors[status])} />
      <span>{labels[status]}</span>
    </div>
  );
}

"use client";

import type { SuggestedReply } from "@/lib/suggested-replies";
import { cn } from "@/lib/utils";

type Props = {
  replies: SuggestedReply[];
  onPick: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Suggested-reply chip strip rendered above a chat composer. Each chip is a
 * focusable button; click submits the chip's value through the caller's send
 * path. Renders nothing when there are no replies — caller doesn't need to
 * gate.
 */
export function SuggestedReplies({
  replies,
  onPick,
  disabled,
  className,
}: Props): React.ReactElement | null {
  if (replies.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Suggested replies"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {replies.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onPick(r.value)}
          disabled={disabled}
          className={cn(
            "inline-flex min-h-[32px] items-center rounded-full border border-border bg-background px-3 py-1 text-[12px] text-foreground/90 transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

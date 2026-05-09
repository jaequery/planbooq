"use client";

import type { Priority } from "@prisma/client";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PriorityValue = Priority;

type PriorityOption = { value: PriorityValue; label: string };

const NO_PRIORITY_OPTION: PriorityOption = { value: "NO_PRIORITY", label: "No priority" };

const PRIORITY_OPTIONS: ReadonlyArray<PriorityOption> = [
  NO_PRIORITY_OPTION,
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export function priorityMeta(value: PriorityValue): { label: string } {
  return PRIORITY_OPTIONS.find((o) => o.value === value) ?? NO_PRIORITY_OPTION;
}

export function PriorityIcon({
  value,
  className,
}: {
  value: PriorityValue;
  className?: string;
}): React.ReactElement {
  const label = priorityMeta(value).label;
  if (value === "URGENT") {
    return (
      <svg
        viewBox="0 0 16 16"
        className={cn("h-3.5 w-3.5 shrink-0", className)}
        role="img"
        aria-label={label}
        focusable="false"
      >
        <title>{label}</title>
        <rect x="1" y="1" width="14" height="14" rx="3" className="fill-red-500" />
        <rect x="7.25" y="3.5" width="1.5" height="5.5" rx="0.5" className="fill-white" />
        <rect x="7.25" y="10.5" width="1.5" height="2" rx="0.5" className="fill-white" />
      </svg>
    );
  }
  if (value === "NO_PRIORITY") {
    return (
      <svg
        viewBox="0 0 16 16"
        className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60", className)}
        role="img"
        aria-label={label}
        focusable="false"
      >
        <title>{label}</title>
        <rect x="2" y="7.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
        <rect x="6.75" y="7.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
        <rect x="11.5" y="7.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
      </svg>
    );
  }
  const filled = value === "LOW" ? 1 : value === "MEDIUM" ? 2 : 3;
  const activeClass =
    value === "LOW" ? "fill-sky-500" : value === "MEDIUM" ? "fill-amber-500" : "fill-orange-500";
  const mutedClass = "fill-muted-foreground/30";
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <title>{label}</title>
      <rect
        x="2"
        y="10"
        width="3"
        height="4"
        rx="0.75"
        className={filled >= 1 ? activeClass : mutedClass}
      />
      <rect
        x="6.5"
        y="6.5"
        width="3"
        height="7.5"
        rx="0.75"
        className={filled >= 2 ? activeClass : mutedClass}
      />
      <rect
        x="11"
        y="3"
        width="3"
        height="11"
        rx="0.75"
        className={filled >= 3 ? activeClass : mutedClass}
      />
    </svg>
  );
}

type Props = {
  ticketId: string;
  value: PriorityValue;
  onChange: (next: PriorityValue) => void;
};

export function PriorityPicker({ ticketId, value, onChange }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const meta = priorityMeta(value);
  const isEmpty = value === "NO_PRIORITY";

  const select = (next: PriorityValue): void => {
    setOpen(false);
    if (next === value) return;
    const previous = value;
    onChange(next);
    startTransition(async () => {
      const result = await updateTicket({ ticketId, priority: next });
      if (!result.ok) {
        onChange(previous);
        toast.error(`Could not update priority: ${result.error}`);
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Set priority"
          className={cn(
            "h-8 flex-1 justify-start gap-2 px-2 text-[13px] font-normal",
            isEmpty ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <PriorityIcon value={value} />
          <span className="truncate">{isEmpty ? "Set priority" : meta.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[240px] p-1"
        role="listbox"
        aria-label="Priority options"
      >
        {PRIORITY_OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => select(opt.value)}
              className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <PriorityIcon value={opt.value} />
              <span className="flex-1 text-left">{opt.label}</span>
              {selected ? (
                <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

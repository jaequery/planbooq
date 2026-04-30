"use client";

import type { Priority } from "@prisma/client";
import { AlertTriangle, Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PriorityValue = Priority;

type PriorityOption = { value: PriorityValue; label: string; dotClass: string };

const NO_PRIORITY_OPTION: PriorityOption = {
  value: "NO_PRIORITY",
  label: "No priority",
  dotClass: "border-dashed border border-current",
};

const PRIORITY_OPTIONS: ReadonlyArray<PriorityOption> = [
  NO_PRIORITY_OPTION,
  { value: "URGENT", label: "Urgent", dotClass: "bg-red-500" },
  { value: "HIGH", label: "High", dotClass: "bg-orange-500" },
  { value: "MEDIUM", label: "Medium", dotClass: "bg-amber-500" },
  { value: "LOW", label: "Low", dotClass: "bg-sky-500" },
];

export function priorityMeta(value: PriorityValue): { label: string; dotClass: string } {
  return PRIORITY_OPTIONS.find((o) => o.value === value) ?? NO_PRIORITY_OPTION;
}

export function PriorityIcon({
  value,
  className,
}: {
  value: PriorityValue;
  className?: string;
}): React.ReactElement {
  const meta = priorityMeta(value);
  if (value === "URGENT") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <span aria-hidden className={cn("inline-block h-2.5 w-2.5 rounded-full", meta.dotClass)} />
        <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        meta.dotClass,
        value === "NO_PRIORITY" && "text-muted-foreground/60",
        className,
      )}
    />
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

"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type StatusOption = { id: string; name: string; color: string };

type Props = {
  ticketId: string;
  value: string;
  options: ReadonlyArray<StatusOption>;
  onChange: (next: StatusOption) => void;
};

export function StatusPicker({ ticketId, value, options, onChange }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const current = options.find((o) => o.id === value) ?? options[0];

  const select = (next: StatusOption): void => {
    setOpen(false);
    if (!current || next.id === current.id) return;
    const previous = current;
    onChange(next);
    startTransition(async () => {
      const result = await moveTicket({ ticketId, toStatusId: next.id });
      if (!result.ok) {
        onChange(previous);
        toast.error(`Could not update status: ${result.error}`);
      }
    });
  };

  if (!current) {
    return <div className="flex-1 px-2 py-1.5 text-[13px] text-muted-foreground">No status</div>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Set status"
          className={cn(
            "h-8 flex-1 justify-start gap-2 px-2 text-[13px] font-normal text-foreground",
          )}
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: current.color }}
          />
          <span className="truncate">{current.name}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[240px] p-1"
        role="listbox"
        aria-label="Status options"
      >
        {options.map((opt) => {
          const selected = opt.id === current.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => select(opt)}
              className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              <span className="flex-1 truncate text-left">{opt.name}</span>
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

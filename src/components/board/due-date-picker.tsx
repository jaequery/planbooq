"use client";

import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  ticketId: string;
  value: Date | null;
  onChange: (next: Date | null) => void;
  overdue?: boolean;
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDueDate(value: Date): string {
  const now = new Date();
  const sameYear = value.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(value);
}

export function DueDatePicker({
  ticketId,
  value,
  onChange,
  overdue = false,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(value ?? new Date()));
  const [, startTransition] = useTransition();

  const today = startOfDay(new Date());

  const grid = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const persist = (next: Date | null): void => {
    setOpen(false);
    const prevTime = value ? value.getTime() : null;
    const nextTime = next ? next.getTime() : null;
    if (prevTime === nextTime) return;
    const previous = value;
    onChange(next);
    startTransition(async () => {
      const result = await updateTicket({ ticketId, dueDate: next });
      if (!result.ok) {
        onChange(previous);
        toast.error(`Could not update due date: ${result.error}`);
      }
    });
  };

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(viewMonth);

  const isEmpty = !value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Set due date"
          className={cn(
            "h-8 flex-1 justify-start gap-2 px-2 text-[13px] font-normal",
            isEmpty
              ? "text-muted-foreground"
              : overdue
                ? "text-red-600 dark:text-red-400"
                : "text-foreground",
          )}
        >
          {overdue && value ? (
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="truncate">{value ? formatDueDate(value) : "Set due date"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[260px] p-2">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Previous month"
            onClick={() => setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="text-[13px] font-medium text-foreground">{monthLabel}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Next month"
            onClick={() => setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
          {DAY_LABELS.map((d, i) => (
            <div key={`${d}-${i}`} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="h-7" />;
            const isToday = isSameDay(day, today);
            const isSelected = value ? isSameDay(day, value) : false;
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => persist(day)}
                aria-label={day.toDateString()}
                aria-pressed={isSelected}
                className={cn(
                  "h-7 rounded-sm text-[12px] tabular-nums hover:bg-accent focus:bg-accent focus:outline-none",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                  !isSelected && isToday && "ring-1 ring-ring",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between gap-1.5 border-t border-border/60 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setViewMonth(startOfMonth(today));
              persist(today);
            }}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => persist(null)}
            disabled={!value}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

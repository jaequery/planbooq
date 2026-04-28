"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNowStrict } from "date-fns";
import { Layers } from "lucide-react";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticket: Ticket;
  isOverlay?: boolean;
};

export function TicketCard({ ticket, isOverlay }: Props): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    data: { type: "ticket", statusId: ticket.statusId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group select-none rounded-md border border-border/70 bg-card px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)] outline-none",
        "transition-[transform,box-shadow,border-color] duration-150",
        "hover:border-border hover:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_8px_-4px_rgba(0,0,0,0.08)]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isDragging && !isOverlay && "opacity-40",
        isOverlay && "scale-[1.02] cursor-grabbing border-border shadow-lg ring-1 ring-black/5",
      )}
    >
      <div className="text-[13px] font-medium leading-snug text-foreground">{ticket.title}</div>
      {ticket.description ? (
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {ticket.description}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground/80">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3 w-3" />
          <span>—</span>
        </span>
        <time dateTime={new Date(ticket.createdAt).toISOString()}>
          {formatDistanceToNowStrict(new Date(ticket.createdAt), { addSuffix: false })}
        </time>
      </div>
    </div>
  );
}

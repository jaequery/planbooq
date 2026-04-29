"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNowStrict } from "date-fns";
import { Archive, Clock3, FileText, MoreHorizontal, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveTicket } from "@/actions/ticket";
import { TicketDetailDialog } from "@/components/board/ticket-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticket: Ticket;
  isOverlay?: boolean;
  onUpdated?: (ticket: Ticket) => void;
  onArchived?: (ticketId: string) => void;
};

export function TicketCard({
  ticket,
  isOverlay = false,
  onUpdated,
  onArchived,
}: Props): React.ReactElement {
  const [detailOpen, setDetailOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pendingArchive, startArchiveTransition] = useTransition();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    data: { type: "ticket", statusId: ticket.statusId },
    disabled: isOverlay,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const stopDragPropagation = (event: React.SyntheticEvent): void => {
    event.stopPropagation();
  };

  const handleArchive = (): void => {
    startArchiveTransition(async () => {
      const result = await archiveTicket({ ticketId: ticket.id });
      if (!result.ok) {
        toast.error(`Could not archive ticket: ${result.error}`);
        return;
      }
      onArchived?.(ticket.id);
      toast.success("Ticket archived");
      setArchiveOpen(false);
    });
  };

  const openedAt = new Date(ticket.createdAt);
  const updatedAt = new Date(ticket.updatedAt);
  const wasEdited = updatedAt.getTime() - openedAt.getTime() > 1000;

  return (
    <>
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
          !isOverlay && "cursor-pointer",
          isDragging && !isOverlay && "opacity-40",
          isOverlay && "scale-[1.02] cursor-grabbing border-border shadow-lg ring-1 ring-black/5",
        )}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left outline-none"
            onPointerDown={stopDragPropagation}
            onClick={() => {
              if (!isOverlay) setDetailOpen(true);
            }}
            aria-label={`Open ${ticket.title}`}
          >
            <div className="text-[13px] font-medium leading-snug text-foreground">
              {ticket.title}
            </div>
            {ticket.description ? (
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                {ticket.description}
              </p>
            ) : null}
          </button>
          {!isOverlay ? (
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="-mr-1 -mt-1 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label="Ticket actions"
                    onPointerDown={stopDragPropagation}
                    onClick={stopDragPropagation}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onSelect={() => setDetailOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
                    <Archive className="h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline" className="h-5 rounded-md px-1.5 font-mono text-[10px]">
              {ticket.id.slice(-6).toUpperCase()}
            </Badge>
            {ticket.description ? (
              <span className="inline-flex items-center gap-1" title="Has description">
                <FileText className="h-3 w-3" />
              </span>
            ) : null}
            {wasEdited ? (
              <span className="inline-flex items-center gap-1" title="Recently edited">
                <Clock3 className="h-3 w-3" />
                edited
              </span>
            ) : null}
          </div>
          <time dateTime={openedAt.toISOString()}>
            {formatDistanceToNowStrict(openedAt, { addSuffix: false })}
          </time>
        </div>
      </div>
      {!isOverlay ? (
        <>
          <TicketDetailDialog
            ticket={ticket}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            onUpdated={(updated) => onUpdated?.(updated)}
          />
          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Archive ticket?</DialogTitle>
                <DialogDescription>
                  This removes the ticket from the launch board without permanently deleting it.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-[13px]">
                <div className="font-medium text-foreground">{ticket.title}</div>
                {ticket.description ? (
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{ticket.description}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setArchiveOpen(false)}
                  disabled={pendingArchive}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleArchive}
                  disabled={pendingArchive}
                >
                  {pendingArchive ? "Archiving…" : "Archive ticket"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </>
  );
}

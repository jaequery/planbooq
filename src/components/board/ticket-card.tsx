"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertCircle, Archive, Clock3, FileText, MoreHorizontal, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveTicket } from "@/actions/ticket";
import { AssigneeAvatar } from "@/components/board/assignee-picker";
import { formatDueDate } from "@/components/board/due-date-picker";
import { LabelChip } from "@/components/board/label-picker";
import { PriorityIcon } from "@/components/board/priority-picker";
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
import type { TicketWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

// Statuses where a missed due date should not raise an overdue alarm.
const COMPLETED_STATUS_KEYS = new Set(["completed", "shipping"]);

type Props = {
  ticket: TicketWithRelations;
  isOverlay?: boolean;
  onUpdated?: (ticket: TicketWithRelations) => void;
  onArchived?: (ticketId: string) => void;
  onDeleted?: (ticketId: string) => void;
  statusName?: string;
  statusColor?: string;
  statusKey?: string;
  projectName?: string;
  projectColor?: string;
  projectSlug?: string;
};

export function TicketCard({
  ticket,
  isOverlay = false,
  onUpdated,
  onArchived,
  onDeleted,
  statusName = "",
  statusColor = "#94a3b8",
  statusKey,
  projectName = "",
  projectColor = "#94a3b8",
  projectSlug,
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

  const dueDate = ticket.dueDate ? new Date(ticket.dueDate) : null;
  const isCompletedStatus = statusKey ? COMPLETED_STATUS_KEYS.has(statusKey) : false;
  const isOverdue = (() => {
    if (!dueDate || isCompletedStatus) return false;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return dueDate.getTime() < start.getTime();
  })();
  const labels = ticket.labels ?? [];
  const visibleLabels = labels.slice(0, 3);
  const hiddenLabelCount = labels.length - visibleLabels.length;

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
            <div className="flex items-start gap-1.5">
              {ticket.priority !== "NO_PRIORITY" ? (
                <span className="mt-1 shrink-0">
                  <PriorityIcon value={ticket.priority} />
                </span>
              ) : null}
              <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
                {ticket.title}
              </div>
            </div>
            {ticket.description ? (
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                {ticket.description}
              </p>
            ) : null}
          </button>
          {!isOverlay && ticket.assignee ? (
            <AssigneeAvatar
              name={ticket.assignee.name}
              image={ticket.assignee.image}
              size="xs"
              className="mt-0.5"
            />
          ) : null}
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
        {visibleLabels.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {visibleLabels.map((l) => (
              <LabelChip key={l.id} label={l} size="sm" />
            ))}
            {hiddenLabelCount > 0 ? (
              <span className="text-[10px] text-muted-foreground">+{hiddenLabelCount}</span>
            ) : null}
          </div>
        ) : null}
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
          <div className="flex items-center gap-1.5">
            {dueDate ? (
              <span
                className={cn(
                  "inline-flex h-4 items-center gap-0.5 rounded-md border px-1 text-[10px]",
                  isOverdue
                    ? "border-red-500/40 text-red-600 dark:text-red-400"
                    : "border-border text-foreground",
                )}
              >
                {isOverdue ? <AlertCircle className="h-3 w-3" aria-hidden /> : null}
                {formatDueDate(dueDate)}
              </span>
            ) : null}
            <time dateTime={openedAt.toISOString()}>
              {formatDistanceToNowStrict(openedAt, { addSuffix: false })}
            </time>
          </div>
        </div>
      </div>
      {!isOverlay ? (
        <>
          <TicketDetailDialog
            ticket={ticket}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            onUpdated={(updated) => onUpdated?.(updated)}
            onDeleted={(id) => onDeleted?.(id)}
            statusName={statusName}
            statusColor={statusColor}
            projectName={projectName}
            projectColor={projectColor}
            projectSlug={projectSlug}
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

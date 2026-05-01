"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { NewTicketDialog } from "@/components/board/new-ticket-dialog";
import type { StatusOption } from "@/components/board/status-picker";
import { TicketCard } from "@/components/board/ticket-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StatusWithTickets, Ticket, TicketWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  status: StatusWithTickets;
  statuses: ReadonlyArray<StatusOption>;
  tickets?: TicketWithRelations[];
  projectId: string;
  projectName: string;
  projectColor: string;
  projectSlug: string;
  currentUserId: string;
  onTicketCreated: (ticket: Ticket) => void;
  onTicketUpdated: (ticket: TicketWithRelations) => void;
  onTicketArchived: (ticketId: string) => void;
  onTicketDeleted: (ticketId: string) => void;
  isFiltered?: boolean;
};

export function Column({
  status,
  statuses,
  tickets = status.tickets,
  projectId,
  projectName,
  projectColor,
  projectSlug,
  currentUserId,
  onTicketCreated,
  onTicketUpdated,
  onTicketArchived,
  onTicketDeleted,
  isFiltered = false,
}: Props): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
    data: { type: "column", statusId: status.id },
  });
  const isCompact = tickets.length === 0 && !isFiltered;

  return (
    <div
      className={cn(
        "flex h-full shrink-0 flex-col transition-[width] duration-150",
        isCompact ? "w-[160px]" : "w-[300px]",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <div className={cn("flex items-center gap-2", isCompact && "opacity-70")}>
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            {status.name}
          </h3>
          <span className="text-[12px] tabular-nums text-muted-foreground/80">
            {tickets.length}
          </span>
        </div>
        <NewTicketDialog
          projectId={projectId}
          statusId={status.id}
          statusName={status.name}
          onCreated={onTicketCreated}
          compact
        />
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col rounded-lg border border-dashed border-border/40 bg-muted/20 transition-colors",
          !isCompact && "border-solid bg-muted/30",
          isOver && "border-solid border-border/80 bg-muted/50",
        )}
      >
        {isCompact ? null : (
          <ScrollArea className="flex-1">
            <SortableContext
              items={tickets.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1.5 p-2">
                {tickets.length === 0 ? (
                  <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/40 text-[12px] text-muted-foreground/70">
                    No matching tickets
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onUpdated={onTicketUpdated}
                      onArchived={onTicketArchived}
                      onDeleted={onTicketDeleted}
                      statusKey={status.key}
                      statuses={statuses}
                      projectName={projectName}
                      projectColor={projectColor}
                      projectSlug={projectSlug}
                      currentUserId={currentUserId}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

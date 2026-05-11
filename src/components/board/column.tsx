"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { StatusOption } from "@/components/board/status-picker";
import { TicketCard } from "@/components/board/ticket-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StatusWithTickets, TicketWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  status: StatusWithTickets;
  statuses: ReadonlyArray<StatusOption>;
  tickets?: TicketWithRelations[];
  onTicketArchived: (ticketId: string) => void;
  onOpenDetail: (ticketId: string, autoRunAction?: boolean) => void;
  isFiltered?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

export function Column({
  status,
  statuses,
  tickets = status.tickets,
  onTicketArchived,
  onOpenDetail,
  isFiltered = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: Props): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
    data: { type: "column", statusId: status.id },
  });
  const isCompact = tickets.length === 0 && !isFiltered && !isOver;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // `onLoadMore` is recreated on every Board render (closes over pagination
  // state). Pin it via ref so the IntersectionObserver effect only re-runs
  // when the load-more eligibility actually flips.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    const target = sentinelRef.current;
    if (!target) return;
    // The actual scrolling element is the Radix ScrollArea viewport, not the
    // window. IntersectionObserver needs that as its `root` or the sentinel
    // never becomes "visible" relative to the wrong container.
    const viewport = target.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMoreRef.current?.();
            break;
          }
        }
      },
      {
        root: viewport ?? null,
        // Pre-fetch about one card-height before reaching the end so the next
        // page is ready by the time the user gets there.
        rootMargin: "200px 0px",
        threshold: 0,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore]);

  return (
    <div
      className={cn(
        "flex h-full shrink-0 flex-col transition-[width] duration-150",
        isCompact ? "w-[160px]" : "w-[300px]",
      )}
    >
      <div className="flex items-center px-1 pb-2">
        <div className={cn("flex items-center gap-2", isCompact && "opacity-70")}>
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
            {status.name}
          </h3>
          <span className="text-[14px] tabular-nums text-muted-foreground/80">
            {tickets.length}
            {hasMore ? "+" : ""}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col rounded-lg border border-dashed border-border/40 bg-muted/20 transition-[background-color,border-color,box-shadow] duration-150",
          !isCompact && "border-solid bg-muted/30",
          isOver && "border-solid border-primary/60 bg-primary/5 ring-1 ring-primary/30",
        )}
      >
        {isCompact ? null : (
          <ScrollArea className="flex-1">
            <SortableContext
              items={tickets.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex min-h-[120px] flex-col gap-1.5 p-2">
                {tickets.length === 0 ? (
                  <div
                    className={cn(
                      "flex h-24 items-center justify-center rounded-md border border-dashed text-[14px] transition-colors",
                      isOver
                        ? "border-primary/60 bg-primary/5 text-primary"
                        : "border-border/40 text-muted-foreground/70",
                    )}
                  >
                    {isOver ? "Drop here" : "No matching tickets"}
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onArchived={onTicketArchived}
                      onOpenDetail={onOpenDetail}
                      statusKey={status.key}
                      statuses={statuses}
                    />
                  ))
                )}
                {hasMore || isLoadingMore ? (
                  <div
                    ref={sentinelRef}
                    className="flex h-10 items-center justify-center text-[13px] text-muted-foreground/70"
                    aria-live="polite"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <span className="sr-only">Load more</span>
                    )}
                  </div>
                ) : null}
              </div>
            </SortableContext>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

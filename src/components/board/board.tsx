"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { moveTicket } from "@/actions/ticket";
import { Column } from "@/components/board/column";
import { RealtimeIndicator } from "@/components/board/realtime-indicator";
import { TicketCard } from "@/components/board/ticket-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { BoardData, StatusWithTickets, Ticket, TicketWithRelations } from "@/lib/types";

type Props = { initialData: BoardData };

function reorderInsert(list: Ticket[], inserted: Ticket, beforeTicketId: string | null): Ticket[] {
  const without = list.filter((t) => t.id !== inserted.id);
  if (beforeTicketId === null) return [...without, inserted];
  const idx = without.findIndex((t) => t.id === beforeTicketId);
  if (idx < 0) return [...without, inserted];
  return [...without.slice(0, idx), inserted, ...without.slice(idx)];
}

function computePosition(prev: Ticket | undefined, next: Ticket | undefined): number {
  if (prev && next) return (prev.position + next.position) / 2;
  if (prev && !next) return prev.position + 1;
  if (!prev && next) return next.position - 1;
  return 1;
}

export function Board({ initialData }: Props): React.ReactElement {
  const router = useRouter();
  const [statuses, setStatuses] = useState<StatusWithTickets[]>(initialData.statuses);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const currentProjectId = initialData.project.id;

  const allTickets = useMemo(() => {
    const map = new Map<string, TicketWithRelations>();
    for (const s of statuses) for (const t of s.tickets) map.set(t.id, t);
    return map;
  }, [statuses]);

  const localClientIdRef = useRef<string | null>(null);

  const handleEvent = useCallback(
    (event: Parameters<Parameters<typeof useBoardChannel>[1]>[0], fromClientId: string | null) => {
      // Skip echoes of our own publishes — we already applied the optimistic
      // update and reconciled with the server's response.
      if (
        fromClientId !== null &&
        localClientIdRef.current !== null &&
        fromClientId === localClientIdRef.current
      ) {
        return;
      }
      if (event.name === "project.created" || event.name === "project.updated") {
        router.refresh();
        return;
      }
      if (event.name === "project.deleted") {
        if (event.projectId === currentProjectId) {
          router.replace("/");
        } else {
          router.refresh();
        }
        return;
      }
      if (event.projectId !== currentProjectId) return;
      if (event.name === "ticket.moved") {
        setStatuses((prev) => {
          let moving: Ticket | null = null;
          const stripped = prev.map((s) => {
            const found = s.tickets.find((t) => t.id === event.ticketId);
            if (found) moving = { ...found, statusId: event.toStatusId, position: event.position };
            return { ...s, tickets: s.tickets.filter((t) => t.id !== event.ticketId) };
          });
          if (!moving) return prev;
          return stripped.map((s) => {
            if (s.id !== event.toStatusId) return s;
            const next = [...s.tickets, moving as Ticket].sort((a, b) => a.position - b.position);
            return { ...s, tickets: next };
          });
        });
      } else if (event.name === "ticket.updated") {
        setStatuses((prev) => {
          // Payload carries TicketWithRelations; default missing relations
          // defensively in case an older client publishes a bare Ticket.
          const merged: TicketWithRelations = {
            ...event.ticket,
            assignee: event.ticket.assignee ?? null,
            labels: event.ticket.labels ?? [],
          };
          return prev.map((s) => {
            if (s.id !== merged.statusId) {
              return { ...s, tickets: s.tickets.filter((t) => t.id !== merged.id) };
            }
            const without = s.tickets.filter((t) => t.id !== merged.id);
            const next = [...without, merged].sort((a, b) => a.position - b.position);
            return { ...s, tickets: next };
          });
        });
      } else if (event.name === "ticket.archived" || event.name === "ticket.deleted") {
        setStatuses((prev) =>
          prev.map((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== event.ticketId) })),
        );
      } else if (event.name === "ticket.created") {
        setStatuses((prev) => {
          // De-dupe by id against the latest state (closure-captured maps go
          // stale during rapid optimistic + echo races).
          const alreadyPresent = prev.some((s) => s.tickets.some((t) => t.id === event.ticket.id));
          if (alreadyPresent) return prev;
          const created: TicketWithRelations = {
            ...event.ticket,
            assignee: event.ticket.assignee ?? null,
            labels: event.ticket.labels ?? [],
          };
          return prev.map((s) => {
            if (s.id !== created.statusId) return s;
            const next = [...s.tickets, created].sort((a, b) => a.position - b.position);
            return { ...s, tickets: next };
          });
        });
      }
    },
    [currentProjectId, router],
  );

  const { status: rtStatus, clientId: rtClientId } = useBoardChannel(
    initialData.project.workspaceId,
    handleEvent,
  );

  useEffect(() => {
    localClientIdRef.current = rtClientId;
  }, [rtClientId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findStatusOf = useCallback(
    (ticketId: string): StatusWithTickets | undefined =>
      statuses.find((s) => s.tickets.some((t) => t.id === ticketId)),
    [statuses],
  );

  const onTicketCreated = useCallback((ticket: Ticket) => {
    const enriched: TicketWithRelations = { ...ticket, assignee: null, labels: [] };
    setStatuses((prev) => {
      // De-dupe defensively: if the realtime echo arrived first, skip the
      // optimistic insert (and vice versa in the realtime handler).
      const alreadyPresent = prev.some((s) => s.tickets.some((t) => t.id === ticket.id));
      if (alreadyPresent) return prev;
      return prev.map((s) =>
        s.id === ticket.statusId
          ? {
              ...s,
              tickets: [...s.tickets, enriched].sort((a, b) => a.position - b.position),
            }
          : s,
      );
    });
  }, []);

  const onTicketUpdated = useCallback((ticket: TicketWithRelations) => {
    setStatuses((prev) =>
      prev.map((s) => {
        if (s.id !== ticket.statusId) {
          return { ...s, tickets: s.tickets.filter((t) => t.id !== ticket.id) };
        }
        const without = s.tickets.filter((t) => t.id !== ticket.id);
        const next = [...without, ticket].sort((a, b) => a.position - b.position);
        return { ...s, tickets: next };
      }),
    );
  }, []);

  const onTicketArchived = useCallback((ticketId: string) => {
    setStatuses((prev) =>
      prev.map((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== ticketId) })),
    );
  }, []);

  const onTicketDeleted = useCallback((ticketId: string) => {
    setStatuses((prev) =>
      prev.map((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== ticketId) })),
    );
  }, []);

  const onDragStart = (event: DragStartEvent): void => {
    setActiveTicketId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent): void => {
    setActiveTicketId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceStatus = findStatusOf(activeId);
    if (!sourceStatus) return;
    const ticket = sourceStatus.tickets.find((t) => t.id === activeId);
    if (!ticket) return;

    // Determine target status + index.
    let targetStatusId: string | null = null;
    let dropBeforeId: string | null = null;

    const overAsColumn = statuses.find((s) => s.id === overId);
    if (overAsColumn) {
      targetStatusId = overAsColumn.id;
      dropBeforeId = null; // dropped on column body → end of column
    } else {
      const overStatus = findStatusOf(overId);
      if (!overStatus) return;
      targetStatusId = overStatus.id;
      const overIdx = overStatus.tickets.findIndex((t) => t.id === overId);
      // Insert at the position of the over-target. dnd-kit's sortable snaps
      // before the hovered card; treat it as "place before".
      const beforeCandidate = overStatus.tickets[overIdx];
      dropBeforeId = beforeCandidate?.id === activeId ? null : (beforeCandidate?.id ?? null);
    }

    if (!targetStatusId) return;

    // Build the post-move target list to compute neighbours for the float position.
    const targetList =
      targetStatusId === sourceStatus.id
        ? sourceStatus.tickets
        : (statuses.find((s) => s.id === targetStatusId)?.tickets ?? []);
    const projected = reorderInsert(
      targetList,
      { ...ticket, statusId: targetStatusId },
      dropBeforeId,
    );
    const insertedIdx = projected.findIndex((t) => t.id === activeId);
    const prev = projected[insertedIdx - 1];
    const next = projected[insertedIdx + 1];
    // Optimistic-only float for the local render. The server is the source of
    // truth for the persisted position and broadcasts the authoritative value.
    const optimisticPosition = computePosition(prev, next);
    const beforeTicketId: string | null = prev?.id ?? null;
    const afterTicketId: string | null = next?.id ?? null;

    // No-op guard: same column, same neighbours.
    if (sourceStatus.id === targetStatusId && ticket.position === optimisticPosition) {
      return;
    }

    const previousStatuses = statuses;

    // Optimistic update.
    setStatuses((cur) => {
      const stripped = cur.map((s) => ({
        ...s,
        tickets: s.tickets.filter((t) => t.id !== activeId),
      }));
      return stripped.map((s) => {
        if (s.id !== targetStatusId) return s;
        const updated: Ticket = {
          ...ticket,
          statusId: targetStatusId,
          position: optimisticPosition,
        };
        const merged = [...s.tickets, updated].sort((a, b) => a.position - b.position);
        return { ...s, tickets: merged };
      });
    });

    void moveTicket({
      ticketId: activeId,
      toStatusId: targetStatusId,
      beforeTicketId,
      afterTicketId,
    }).then((result) => {
      if (!result.ok) {
        toast.error(`Move failed: ${result.error}`);
        setStatuses(previousStatuses);
        return;
      }
      // Reconcile with server-authoritative position.
      setStatuses((cur) =>
        cur.map((s) => {
          if (s.id !== targetStatusId) return s;
          const tickets = s.tickets
            .map((t) => (t.id === activeId ? { ...t, position: result.data.position } : t))
            .sort((a, b) => a.position - b.position);
          return { ...s, tickets };
        }),
      );
    });
  };

  const activeTicket = activeTicketId ? (allTickets.get(activeTicketId) ?? null) : null;
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltered = normalizedQuery.length > 0;
  const isDragging = activeTicketId !== null;
  const visibleStatuses = useMemo(
    () =>
      statuses
        .map((status) => ({
          ...status,
          tickets: status.tickets.filter((ticket) => {
            if (!normalizedQuery) return true;
            return (
              ticket.title.toLowerCase().includes(normalizedQuery) ||
              (ticket.description?.toLowerCase().includes(normalizedQuery) ?? false)
            );
          }),
        }))
        // Hide empty columns by default. Keep them visible while a drag is active
        // so users have a drop target for previously-empty statuses.
        .filter((status) => isDragging || status.tickets.length > 0),
    [normalizedQuery, statuses, isDragging],
  );
  const visibleTicketCount = visibleStatuses.reduce(
    (sum, status) => sum + status.tickets.length,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tickets…"
            className="h-8 pl-8 pr-8 text-[13px]"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        {isFiltered ? (
          <span className="text-[12px] tabular-nums text-muted-foreground/70">
            {visibleTicketCount} match{visibleTicketCount === 1 ? "" : "es"}
          </span>
        ) : null}
        <div className="ml-auto">
          <RealtimeIndicator status={rtStatus} />
        </div>
      </div>
      <DndContext
        id="board-dnd"
        sensors={sensors}
        modifiers={[restrictToWindowEdges]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTicketId(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4">
          {visibleStatuses.map((status) => (
            <Column
              key={status.id}
              status={status}
              tickets={status.tickets}
              projectId={initialData.project.id}
              projectName={initialData.project.name}
              projectColor={initialData.project.color}
              projectSlug={initialData.project.slug}
              onTicketCreated={onTicketCreated}
              onTicketUpdated={onTicketUpdated}
              onTicketArchived={onTicketArchived}
              onTicketDeleted={onTicketDeleted}
              isFiltered={isFiltered}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTicket ? <TicketCard ticket={activeTicket} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

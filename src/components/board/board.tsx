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
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { moveTicket } from "@/actions/ticket";
import { Column } from "@/components/board/column";
import { RealtimeIndicator } from "@/components/board/realtime-indicator";
import { TicketCard } from "@/components/board/ticket-card";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { BoardData, StatusWithTickets, Ticket } from "@/lib/types";

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
  const [statuses, setStatuses] = useState<StatusWithTickets[]>(initialData.statuses);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const allTickets = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const s of statuses) for (const t of s.tickets) map.set(t.id, t);
    return map;
  }, [statuses]);

  const handleEvent = useCallback(
    (event: Parameters<Parameters<typeof useBoardChannel>[1]>[0], fromClientId: string | null) => {
      // Ignore echoes from this user (clientId is the userId in our token).
      // We can't read the session here, but server publishes after the local
      // optimistic update has already been applied; reconciling here is still
      // safe because the operations are idempotent.
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
      } else if (event.name === "ticket.created") {
        setStatuses((prev) => {
          if (allTickets.has(event.ticket.id)) return prev;
          return prev.map((s) => {
            if (s.id !== event.ticket.statusId) return s;
            const next = [...s.tickets, event.ticket].sort((a, b) => a.position - b.position);
            return { ...s, tickets: next };
          });
        });
      }
      void fromClientId;
    },
    [allTickets],
  );

  const { status: rtStatus } = useBoardChannel(initialData.workspace.id, handleEvent);

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
    setStatuses((prev) =>
      prev.map((s) =>
        s.id === ticket.statusId
          ? {
              ...s,
              tickets: [...s.tickets, ticket].sort((a, b) => a.position - b.position),
            }
          : s,
      ),
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
    let beforeTicketId: string | null = null;

    const overAsColumn = statuses.find((s) => s.id === overId);
    if (overAsColumn) {
      targetStatusId = overAsColumn.id;
      beforeTicketId = null; // dropped on column body → end of column
    } else {
      const overStatus = findStatusOf(overId);
      if (!overStatus) return;
      targetStatusId = overStatus.id;
      const overIdx = overStatus.tickets.findIndex((t) => t.id === overId);
      // Insert at the position of the over-target. dnd-kit's sortable snaps
      // before the hovered card; treat it as "place before".
      const beforeCandidate = overStatus.tickets[overIdx];
      beforeTicketId = beforeCandidate?.id === activeId ? null : (beforeCandidate?.id ?? null);
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
      beforeTicketId,
    );
    const insertedIdx = projected.findIndex((t) => t.id === activeId);
    const prev = projected[insertedIdx - 1];
    const next = projected[insertedIdx + 1];
    const newPosition = computePosition(prev, next);

    // No-op guard: same column, same neighbours.
    if (sourceStatus.id === targetStatusId && ticket.position === newPosition) {
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
        const updated: Ticket = { ...ticket, statusId: targetStatusId, position: newPosition };
        const merged = [...s.tickets, updated].sort((a, b) => a.position - b.position);
        return { ...s, tickets: merged };
      });
    });

    void moveTicket({ ticketId: activeId, toStatusId: targetStatusId, newPosition }).then(
      (result) => {
        if (!result.ok) {
          toast.error(`Move failed: ${result.error}`);
          setStatuses(previousStatuses);
        }
      },
    );
  };

  const activeTicket = activeTicketId ? (allTickets.get(activeTicketId) ?? null) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="text-[13px] font-medium text-muted-foreground">Board</div>
        <RealtimeIndicator status={rtStatus} />
      </div>
      <DndContext
        sensors={sensors}
        modifiers={[restrictToWindowEdges]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTicketId(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4">
          {statuses.map((status) => (
            <Column
              key={status.id}
              status={status}
              workspaceId={initialData.workspace.id}
              onTicketCreated={onTicketCreated}
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

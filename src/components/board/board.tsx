"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { ChatOrb } from "@/components/board/chat-orb";
import { Column } from "@/components/board/column";
import { ProjectDocsPanel } from "@/components/board/project-docs-panel";
import { RealtimeIndicator } from "@/components/board/realtime-indicator";
import { TicketCard } from "@/components/board/ticket-card";
import { TicketDetailDialog } from "@/components/board/ticket-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type LiveAgentState, LiveAgentsContext } from "@/lib/live-agents-context";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { BoardData, StatusWithTickets, Ticket, TicketWithRelations } from "@/lib/types";
import { getDesktopBridge } from "@/lib/use-is-desktop";

/**
 * Best-effort "last line" extraction for the live indicator. PLAN streams
 * raw markdown so we just take the trimmed tail. EXECUTE/CHAT stream JSONL
 * (one wire event per line) where text is buried in JSON; in that case we
 * fall back to a generic "running" hint. Card UI truncates further.
 */
function extractTail(kind: "PLAN" | "EXECUTE" | "CHAT", text: string): string | null {
  const trimmed = text.replace(/\s+$/u, "");
  if (!trimmed) return null;
  if (kind === "PLAN") {
    const tail = trimmed.slice(-120);
    return (
      tail
        .replace(/[#*`_>-]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim() || null
    );
  }
  return null;
}

type Props = { initialData: BoardData; currentUserId: string };

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

function byUpdatedDesc(a: Ticket, b: Ticket): number {
  const diff = +new Date(b.updatedAt) - +new Date(a.updatedAt);
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

export function Board({ initialData, currentUserId }: Props): React.ReactElement {
  const router = useRouter();
  const [statuses, setStatuses] = useState<StatusWithTickets[]>(initialData.statuses);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const [autoRunOnOpen, setAutoRunOnOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [liveAgents, setLiveAgents] = useState<ReadonlyMap<string, LiveAgentState>>(new Map());
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
      if (event.name === "agent.delta") {
        setLiveAgents((prev) => {
          const next = new Map(prev);
          const cur = next.get(event.ticketId);
          const status = event.status ?? cur?.status ?? "RUNNING";
          const tail = event.appendOutput ? extractTail(event.kind, event.appendOutput) : null;
          next.set(event.ticketId, {
            jobId: event.jobId,
            kind: event.kind,
            status,
            lastLine: tail ?? cur?.lastLine ?? null,
          });
          return next;
        });
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
      // Preview events are workspace-scoped (no projectId). Match by ticketId
      // already in local state — tickets from other projects won't match.
      if (event.name === "ticket.preview.added") {
        if (!event.mimeType.startsWith("image/")) return;
        setStatuses((prev) =>
          prev.map((s) => ({
            ...s,
            tickets: s.tickets.map((t) => {
              if (t.id !== event.ticketId) return t;
              const current = t.imagePreviews ?? [];
              if (current.some((p) => p.id === event.previewId)) return t;
              return {
                ...t,
                imagePreviews: [
                  ...current,
                  {
                    id: event.previewId,
                    attachmentId: event.attachmentId,
                    mimeType: event.mimeType,
                  },
                ],
              };
            }),
          })),
        );
        return;
      }
      if (event.name === "ticket.preview.removed") {
        setStatuses((prev) =>
          prev.map((s) => ({
            ...s,
            tickets: s.tickets.map((t) => {
              if (t.id !== event.ticketId) return t;
              const current = t.imagePreviews ?? [];
              if (!current.some((p) => p.id === event.previewId)) return t;
              return {
                ...t,
                imagePreviews: current.filter((p) => p.id !== event.previewId),
              };
            }),
          })),
        );
        return;
      }
      if (!("projectId" in event) || event.projectId !== currentProjectId) return;
      if (event.name === "ticket.moved") {
        setStatuses((prevStatuses) => {
          // If the ticket landed in a terminal column, drop any lingering
          // live-agent state so the card doesn't render a stale "running" pill.
          const dest = prevStatuses.find((s) => s.id === event.toStatusId);
          if (dest && (dest.key === "completed" || dest.key === "review")) {
            setLiveAgents((prev) => {
              if (!prev.has(event.ticketId)) return prev;
              const next = new Map(prev);
              next.delete(event.ticketId);
              return next;
            });
          }
          // PR merged on GitHub → server moved the ticket to Completed via
          // webhook. If we're in the desktop app and have a local repo path,
          // fast-forward the default branch so the local checkout reflects the
          // merge without manual intervention.
          if (
            dest?.key === "completed" &&
            event.by === "github-webhook" &&
            initialData.project.localPath
          ) {
            const bridge = getDesktopBridge();
            const localPath = initialData.project.localPath;
            void bridge?.pullMain?.({ repoPath: localPath }).then((res) => {
              if (res.ok && res.updated) {
                toast.success(`Pulled latest ${res.branch}`);
              } else if (!res.ok) {
                toast.error(`Auto-pull failed: ${res.error}`);
              }
            });
          }
          return prevStatuses;
        });
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
            const next = [...s.tickets, moving as Ticket].sort(byUpdatedDesc);
            return { ...s, tickets: next };
          });
        });
      } else if (event.name === "ticket.updated") {
        setStatuses((prev) => {
          // Payload carries TicketWithRelations; default missing relations
          // defensively in case an older client publishes a bare Ticket.
          // Preserve imagePreviews from local state — the update payload
          // doesn't carry them, and preview add/remove flows through their
          // own events.
          const existing = prev.flatMap((s) => s.tickets).find((t) => t.id === event.ticket.id);
          const merged: TicketWithRelations = {
            ...event.ticket,
            assignee: event.ticket.assignee ?? null,
            labels: event.ticket.labels ?? [],
            imagePreviews: event.ticket.imagePreviews ?? existing?.imagePreviews ?? [],
          };
          return prev.map((s) => {
            if (s.id !== merged.statusId) {
              return { ...s, tickets: s.tickets.filter((t) => t.id !== merged.id) };
            }
            const without = s.tickets.filter((t) => t.id !== merged.id);
            const next = [...without, merged].sort(byUpdatedDesc);
            return { ...s, tickets: next };
          });
        });
        // Fan out a window event so panels mounted inside an open ticket
        // dialog (e.g. workflow panel) can refetch their server-derived
        // state without each subscribing to Ably independently.
        window.dispatchEvent(
          new CustomEvent("planbooq:ticket-updated", {
            detail: { ticketId: event.ticket.id },
          }),
        );
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
            const next = [...s.tickets, created].sort(byUpdatedDesc);
            return { ...s, tickets: next };
          });
        });
      }
    },
    [currentProjectId, router, initialData.project.localPath],
  );

  const { status: rtStatus, clientId: rtClientId } = useBoardChannel(
    initialData.project.workspaceId,
    handleEvent,
  );

  useEffect(() => {
    localClientIdRef.current = rtClientId;
  }, [rtClientId]);

  // Seed/reconcile liveAgents from the server. Ably deltas are the live
  // source of truth, but missed terminal events leave entries stuck on
  // RUNNING across reloads. On mount and whenever the tab becomes visible,
  // ask the server which jobs are actually still live and prune the rest.
  useEffect(() => {
    const workspaceId = initialData.project.workspaceId;
    let cancelled = false;
    const reconcile = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/active-jobs`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          ok: boolean;
          data?: Array<{
            id: string;
            ticketId: string;
            kind: string;
            status: "PENDING" | "RUNNING";
          }>;
        };
        if (cancelled || !body.ok || !body.data) return;
        setLiveAgents((prev) => {
          const next = new Map<string, LiveAgentState>();
          for (const job of body.data ?? []) {
            const kind: LiveAgentState["kind"] =
              job.kind === "PLAN" || job.kind === "EXECUTE" ? job.kind : "CHAT";
            const existing = prev.get(job.ticketId);
            next.set(job.ticketId, {
              jobId: job.id,
              kind,
              status: job.status,
              lastLine: existing?.jobId === job.id ? (existing.lastLine ?? null) : null,
            });
          }
          // Equality check to avoid unnecessary re-renders.
          if (prev.size === next.size) {
            let same = true;
            for (const [k, v] of next) {
              const p = prev.get(k);
              if (!p || p.jobId !== v.jobId || p.status !== v.status) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return next;
        });
      } catch {
        // tolerated — next visibility change or reload will retry
      }
    };
    void reconcile();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void reconcile();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initialData.project.workspaceId]);

  // Local-first stand-in for GitHub webhooks: every 8s ask the server to
  // walk Review-status tickets with a prUrl and ask GitHub whether the PR
  // merged. Merged PRs trigger the same auto-complete path the webhook
  // would, including the Ably `ticket.moved` fanout that this board's
  // existing handler picks up. Skips while tab is hidden, and fires
  // immediately on tab focus so a merge that happened off-screen lands as
  // soon as the user looks at the board.
  useEffect(() => {
    const workspaceId = initialData.project.workspaceId;
    const interval = 8_000;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    const runOnce = async (): Promise<void> => {
      if (inFlight) return;
      inFlight = true;
      try {
        await fetch(`/api/workspaces/${workspaceId}/poll-prs`, {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // tolerated — next tick will retry
      } finally {
        inFlight = false;
      }
    };
    const tick = async (): Promise<void> => {
      if (stopped) return;
      if (document.visibilityState === "visible") await runOnce();
      if (!stopped) timer = setTimeout(tick, interval);
    };
    void tick();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void runOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initialData.project.workspaceId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findStatusOf = useCallback(
    (ticketId: string): StatusWithTickets | undefined =>
      statuses.find((s) => s.tickets.some((t) => t.id === ticketId)),
    [statuses],
  );

  const insertOptimisticTicket = useCallback((ticket: TicketWithRelations) => {
    setStatuses((prev) => {
      const alreadyPresent = prev.some((s) => s.tickets.some((t) => t.id === ticket.id));
      if (alreadyPresent) return prev;
      return prev.map((s) =>
        s.id === ticket.statusId
          ? { ...s, tickets: [...s.tickets, ticket].sort(byUpdatedDesc) }
          : s,
      );
    });
  }, []);

  const replaceOptimisticTicket = useCallback((tempId: string, real: Ticket) => {
    const enriched: TicketWithRelations = { ...real, assignee: null, labels: [] };
    setStatuses((prev) => {
      const stripped = prev.map((s) => ({
        ...s,
        tickets: s.tickets.filter((t) => t.id !== tempId),
      }));
      const alreadyPresent = stripped.some((s) => s.tickets.some((t) => t.id === enriched.id));
      if (alreadyPresent) return stripped;
      return stripped.map((s) =>
        s.id === enriched.statusId
          ? { ...s, tickets: [...s.tickets, enriched].sort(byUpdatedDesc) }
          : s,
      );
    });
  }, []);

  const rollbackOptimisticTicket = useCallback((tempId: string) => {
    setStatuses((prev) =>
      prev.map((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== tempId) })),
    );
  }, []);

  const backlogStatusId = useMemo(
    () => statuses.find((s) => s.key === "backlog")?.id ?? null,
    [statuses],
  );

  const onTicketUpdated = useCallback((ticket: TicketWithRelations) => {
    setStatuses((prev) =>
      prev.map((s) => {
        if (s.id !== ticket.statusId) {
          return { ...s, tickets: s.tickets.filter((t) => t.id !== ticket.id) };
        }
        const without = s.tickets.filter((t) => t.id !== ticket.id);
        const next = [...without, ticket].sort(byUpdatedDesc);
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

  const onOpenDetail = useCallback((ticketId: string, autoRunAction = false) => {
    setAutoRunOnOpen(autoRunAction);
    setDetailTicketId(ticketId);
  }, []);

  const statusOptions = useMemo(
    () => statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, key: s.key })),
    [statuses],
  );

  const detailTicket = detailTicketId ? (allTickets.get(detailTicketId) ?? null) : null;

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
        const merged = [...s.tickets, updated].sort(byUpdatedDesc);
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
            .sort(byUpdatedDesc);
          return { ...s, tickets };
        }),
      );
    });
  };

  const activeTicket = activeTicketId ? (allTickets.get(activeTicketId) ?? null) : null;
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltered = normalizedQuery.length > 0;
  const visibleStatuses = useMemo(
    () =>
      statuses.map((status) => ({
        ...status,
        tickets: status.tickets.filter((ticket) => {
          if (!normalizedQuery) return true;
          return (
            ticket.title.toLowerCase().includes(normalizedQuery) ||
            (ticket.description?.toLowerCase().includes(normalizedQuery) ?? false)
          );
        }),
      })),
    [normalizedQuery, statuses],
  );
  const visibleTicketCount = visibleStatuses.reduce(
    (sum, status) => sum + status.tickets.length,
    0,
  );

  return (
    <LiveAgentsContext.Provider value={liveAgents}>
      <div className="flex h-full min-h-0 flex-col">
        <ProjectDocsPanel localPath={initialData.project.localPath ?? null} />
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tickets…"
              className="h-8 pl-8 pr-8 text-[15px]"
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
            <span className="text-[14px] tabular-nums text-muted-foreground/70">
              {visibleTicketCount} match{visibleTicketCount === 1 ? "" : "es"}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
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
                statuses={statusOptions}
                tickets={status.tickets}
                onTicketArchived={onTicketArchived}
                onOpenDetail={onOpenDetail}
                isFiltered={isFiltered}
              />
            ))}
          </div>
          <DragOverlay
            dropAnimation={{
              duration: 220,
              easing: "cubic-bezier(0.18, 0.67, 0.32, 1)",
            }}
          >
            {activeTicket ? <TicketCard ticket={activeTicket} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
        <ChatOrb
          projectId={currentProjectId}
          workspaceId={initialData.project.workspaceId}
          backlogStatusId={backlogStatusId}
          currentUserId={currentUserId}
          onOptimisticInsert={insertOptimisticTicket}
          onOptimisticReplace={replaceOptimisticTicket}
          onOptimisticRollback={rollbackOptimisticTicket}
        />
        {detailTicket ? (
          <TicketDetailDialog
            ticket={detailTicket}
            open={detailTicketId !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDetailTicketId(null);
                setAutoRunOnOpen(false);
              }
            }}
            autoRunAction={autoRunOnOpen}
            onUpdated={onTicketUpdated}
            onDeleted={onTicketDeleted}
            statuses={statusOptions}
            projectName={initialData.project.name}
            projectColor={initialData.project.color}
            projectSlug={initialData.project.slug}
            currentUserId={currentUserId}
          />
        ) : null}
      </div>
    </LiveAgentsContext.Provider>
  );
}

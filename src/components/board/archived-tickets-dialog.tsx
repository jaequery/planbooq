"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ArchiveRestore } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { listArchivedTickets, unarchiveTicket } from "@/actions/ticket";
import type { StatusOption } from "@/components/board/status-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TicketWithRelations } from "@/lib/types";

type Props = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: ReadonlyArray<StatusOption>;
  onRestored: (ticket: TicketWithRelations) => void;
};

export function ArchivedTicketsDialog({
  projectId,
  open,
  onOpenChange,
  statuses,
  onRestored,
}: Props): React.ReactElement {
  const [tickets, setTickets] = useState<TicketWithRelations[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [, startRestoreTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const result = await listArchivedTickets({ projectId });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setTickets([]);
      } else {
        setTickets(result.data.items);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const handleRestore = (ticket: TicketWithRelations): void => {
    setRestoringId(ticket.id);
    startRestoreTransition(async () => {
      const result = await unarchiveTicket({ ticketId: ticket.id });
      setRestoringId(null);
      if (!result.ok) {
        toast.error(`Could not restore ticket: ${result.error}`);
        return;
      }
      setTickets((prev) => (prev ? prev.filter((t) => t.id !== ticket.id) : prev));
      onRestored(result.data);
      toast.success("Ticket restored");
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Archived tickets</DialogTitle>
          <DialogDescription>
            Tickets you've archived in this project. Restore any to put it back on the board.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[200px]">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-[14px] text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-[14px] text-destructive">
              Failed to load: {error}
            </div>
          ) : tickets && tickets.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
              <div className="text-[14px] font-medium text-foreground">No archived tickets</div>
              <div className="text-[13px] text-muted-foreground">
                Archived tickets from this project will appear here.
              </div>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <ul className="flex flex-col gap-1.5 pr-2">
                {tickets?.map((ticket) => {
                  const status = statuses.find((s) => s.id === ticket.statusId);
                  const archivedAt = ticket.archivedAt ? new Date(ticket.archivedAt) : null;
                  const isRestoring = restoringId === ticket.id;
                  return (
                    <li
                      key={ticket.id}
                      className="flex items-start gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-[14px] font-medium leading-snug text-foreground">
                          {ticket.title}
                        </div>
                        {ticket.description ? (
                          <p className="mt-1 line-clamp-2 break-words text-[13px] leading-snug text-muted-foreground">
                            {ticket.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                          {status ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: status.color }}
                              />
                              {status.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/70">Unknown status</span>
                          )}
                          {archivedAt ? (
                            <span title={archivedAt.toLocaleString()}>
                              archived {formatDistanceToNowStrict(archivedAt, { addSuffix: true })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(ticket)}
                        disabled={isRestoring}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        {isRestoring ? "Restoring…" : "Restore"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

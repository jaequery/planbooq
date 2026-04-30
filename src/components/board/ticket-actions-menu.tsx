"use client";

import { Link2, MoreHorizontal, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTicket } from "@/actions/ticket";
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

type Props = {
  ticketId: string;
  ticketTitle: string;
  projectSlug?: string;
  onDeleted: () => void;
};

export function TicketActionsMenu({
  ticketId,
  ticketTitle,
  projectSlug,
  onDeleted,
}: Props): React.ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startDeleteTransition] = useTransition();

  const copyLink = (): void => {
    if (typeof window === "undefined") return;
    if (!projectSlug) {
      toast.error("Cannot copy link: project unknown");
      return;
    }
    const url = `${window.location.origin}/p/${projectSlug}?ticket=${ticketId}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy link"));
  };

  const handleDelete = (): void => {
    startDeleteTransition(async () => {
      const result = await deleteTicket({ ticketId });
      if (!result.ok) {
        toast.error(`Could not delete ticket: ${result.error}`);
        return;
      }
      setConfirmOpen(false);
      toast.success("Ticket deleted");
      onDeleted();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Ticket actions">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="w-44">
          <DropdownMenuItem onSelect={copyLink}>
            <Link2 className="h-4 w-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete ticket
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete ticket?</DialogTitle>
            <DialogDescription>
              This permanently removes the ticket. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-[13px]">
            <div className="font-medium text-foreground">{ticketTitle}</div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

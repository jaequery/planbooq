"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Ticket } from "@/lib/types";

const Schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
});

type FormValues = z.infer<typeof Schema>;

type Props = {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (ticket: Ticket) => void;
};

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
  onUpdated,
}: Props): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(Schema),
    defaultValues: {
      title: ticket.title,
      description: ticket.description ?? "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      title: ticket.title,
      description: ticket.description ?? "",
    });
  }, [form, open, ticket.description, ticket.title]);

  const onSubmit = (values: FormValues): void => {
    startTransition(async () => {
      const result = await updateTicket({
        ticketId: ticket.id,
        title: values.title,
        description: values.description?.trim() ? values.description : undefined,
      });
      if (!result.ok) {
        toast.error(`Could not update ticket: ${result.error}`);
        return;
      }
      onUpdated(result.data);
      toast.success("Ticket updated");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit ticket</DialogTitle>
          <DialogDescription>Update the work prompt and launch context.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`ticket-title-${ticket.id}`}>Title</Label>
            <Input
              id={`ticket-title-${ticket.id}`}
              placeholder="What needs doing?"
              autoFocus
              {...form.register("title")}
            />
            {form.formState.errors.title ? (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`ticket-description-${ticket.id}`}>Description</Label>
            <Textarea
              id={`ticket-description-${ticket.id}`}
              placeholder="Acceptance criteria, links, screenshots, constraints…"
              rows={7}
              {...form.register("description")}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

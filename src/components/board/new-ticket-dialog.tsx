"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createTicket } from "@/actions/ticket";
import { replaceTicketWorkflowSteps } from "@/actions/workflow";
import {
  TicketCreateWorkflowPanel,
  type TicketCreateWorkflowPanelHandle,
} from "@/components/board/ticket-create-workflow-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImageUploadTextarea } from "@/components/ui/image-upload-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Ticket } from "@/lib/types";

const Schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
});

type FormValues = z.infer<typeof Schema>;

type Props = {
  workspaceId: string;
  projectId: string;
  statusId: string;
  statusName: string;
  onCreated: (ticket: Ticket) => void;
  compact?: boolean;
};

export function NewTicketDialog({
  workspaceId,
  projectId,
  statusId,
  statusName,
  onCreated,
  compact = false,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const workflowRef = useRef<TicketCreateWorkflowPanelHandle | null>(null);
  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(Schema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = (values: FormValues): void => {
    startTransition(async () => {
      const result = await createTicket({
        projectId,
        statusId,
        title: values.title,
        description: values.description?.trim() ? values.description : undefined,
      });
      if (!result.ok) {
        if (result.error === "duplicate_title") {
          toast.error("A ticket with this title already exists in this project.");
        } else {
          toast.error(`Could not create ticket: ${result.error}`);
        }
        return;
      }
      // If the user customised the workflow in the panel, persist that draft
      // as a ticket-scoped override now that the ticket exists. Untouched
      // drafts fall through to the project default via `getTicketWorkflow`,
      // so we skip the write entirely. Failure here is non-fatal — the ticket
      // is already created.
      const draft = workflowRef.current?.getDraft();
      if (draft?.dirty) {
        const wfRes = await replaceTicketWorkflowSteps({
          ticketId: result.data.id,
          steps: draft.steps,
        });
        if (!wfRes.ok) {
          toast.error(`Ticket created, but workflow could not be saved: ${wfRes.error}`);
        }
      }
      onCreated(result.data);
      toast.success("Ticket created");
      form.reset();
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New ticket
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>
            Adds to <span className="font-medium text-foreground">{statusName}</span>.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="What needs doing?"
              autoFocus
              {...form.register("title")}
            />
            {form.formState.errors.title ? (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <ImageUploadTextarea
              id="description"
              workspaceId={workspaceId}
              placeholder="Optional context, acceptance criteria, links…"
              rows={4}
              value={form.watch("description") ?? ""}
              onChange={(e) => form.setValue("description", e.target.value, { shouldDirty: true })}
              onUploadError={(message) => toast.error(`Image upload failed: ${message}`)}
            />
          </div>
          <TicketCreateWorkflowPanel
            ref={workflowRef}
            workspaceId={workspaceId}
            projectId={projectId}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

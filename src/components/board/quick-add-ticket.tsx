"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { quickCreateTicket } from "@/actions/ticket";
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
import type { Ticket } from "@/lib/types";

type Props = {
  workspaceId: string;
  projectId: string;
  onCreated: (ticket: Ticket) => void;
};

function describeError(error: string): string {
  if (error === "no_key") {
    return "OpenRouter API key not configured. Add one in Settings → OpenRouter.";
  }
  if (error === "no_backlog_status") {
    return "This workspace has no Backlog column.";
  }
  if (error === "duplicate_title") {
    return "A ticket with this title already exists in this project.";
  }
  if (error === "openrouter_timeout") {
    return "Drafting timed out after 30s. Try again or use a faster model.";
  }
  if (error.startsWith("openrouter_")) {
    return `LLM request failed (${error}). Check your OpenRouter key and try again.`;
  }
  return `Could not create ticket: ${error}`;
}

export function QuickAddTicket({
  workspaceId,
  projectId,
  onCreated,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await quickCreateTicket({ projectId, prompt: trimmed });
      if (!result.ok) {
        toast.error(describeError(result.error));
        return;
      }
      onCreated(result.data);
      toast.success("Ticket created in Backlog");
      setPrompt("");
      setOpen(false);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && prompt.trim() && !pending) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 text-[12px]">
          <Plus className="h-3.5 w-3.5" />
          Add new
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>
            Describe what you want. The title and description will be drafted by AI and the ticket
            will land in <span className="font-medium text-foreground">Backlog</span>.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <ImageUploadTextarea
            workspaceId={workspaceId}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. Add a dark mode toggle in the top nav, persist preference per user. Paste or drop screenshots to attach."
            rows={6}
            autoFocus
            disabled={pending}
            onUploadError={(message) => toast.error(`Image upload failed: ${message}`)}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !prompt.trim()}>
              {pending ? "Drafting…" : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

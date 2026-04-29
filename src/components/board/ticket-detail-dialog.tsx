"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, MoreHorizontal, Send, Star, Tag, User2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (ticket: Ticket) => void;
  statusName: string;
  statusColor: string;
  projectName: string;
  projectColor: string;
  projectSlug?: string;
};

function renderDescription(text: string): React.ReactElement {
  const lines = text.split("\n");
  const blocks: React.ReactElement[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = (key: string): void => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="my-2 list-disc space-y-1 pl-5">
        {bullets.map((b, i) => (
          <li key={`${key}-${i}`}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  const flushParagraph = (key: string): void => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${key}`} className="my-2 whitespace-pre-wrap leading-relaxed">
        {paragraph.join("\n")}
      </p>,
    );
    paragraph = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph(`${i}`);
      bullets.push(bulletMatch[1] ?? "");
    } else if (line.trim() === "") {
      flushBullets(`${i}`);
      flushParagraph(`${i}`);
    } else {
      flushBullets(`${i}`);
      paragraph.push(line);
    }
  });
  flushBullets("end");
  flushParagraph("end");

  return <div className="text-[14px] text-foreground">{blocks}</div>;
}

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
  onUpdated,
  statusName,
  statusColor,
  projectName,
  projectColor,
  projectSlug,
}: Props): React.ReactElement {
  const [, startTransition] = useTransition();
  const [titleDraft, setTitleDraft] = useState(ticket.title);
  const [descriptionDraft, setDescriptionDraft] = useState(ticket.description ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const editingTitleRef = useRef(false);
  const editingDescRef = useRef(false);
  editingTitleRef.current = isEditingTitle;
  editingDescRef.current = isEditingDescription;

  useEffect(() => {
    if (!editingTitleRef.current) setTitleDraft(ticket.title);
    if (!editingDescRef.current) setDescriptionDraft(ticket.description ?? "");
  }, [ticket.title, ticket.description]);

  useEffect(() => {
    if (!open) {
      setIsEditingTitle(false);
      setIsEditingDescription(false);
    }
  }, [open]);

  const persist = (next: { title?: string; description?: string }, rollback: () => void): void => {
    startTransition(async () => {
      const nextTitle = (next.title ?? ticket.title).trim();
      const nextDescription = next.description ?? ticket.description ?? "";
      const result = await updateTicket({
        ticketId: ticket.id,
        title: nextTitle,
        description: nextDescription.trim() ? nextDescription : undefined,
      });
      if (!result.ok) {
        rollback();
        toast.error(`Could not update ticket: ${result.error}`);
        return;
      }
      onUpdated(result.data);
    });
  };

  const commitTitle = (): void => {
    const trimmed = titleDraft.trim();
    setIsEditingTitle(false);
    if (!trimmed) {
      setTitleDraft(ticket.title);
      toast.error("Title cannot be empty");
      return;
    }
    if (trimmed === ticket.title) return;
    const previous = ticket.title;
    persist({ title: trimmed }, () => setTitleDraft(previous));
  };

  const cancelTitle = (): void => {
    setTitleDraft(ticket.title);
    setIsEditingTitle(false);
  };

  const commitDescription = (): void => {
    setIsEditingDescription(false);
    const original = ticket.description ?? "";
    if (descriptionDraft === original) return;
    const previous = original;
    persist({ description: descriptionDraft }, () => setDescriptionDraft(previous));
  };

  const cancelDescription = (): void => {
    setDescriptionDraft(ticket.description ?? "");
    setIsEditingDescription(false);
  };

  const comingSoon = (label: string) => (): void => {
    toast.info(`${label} coming soon`);
  };

  const createdAt = new Date(ticket.createdAt);
  const updatedAt = new Date(ticket.updatedAt);
  const wasEdited = updatedAt.getTime() - createdAt.getTime() > 1000;
  const ticketId = ticket.id.slice(-6).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]"
      >
        <DialogTitle className="sr-only">{ticket.title}</DialogTitle>
        <DialogDescription className="sr-only">Ticket detail for {ticket.title}</DialogDescription>

        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <div className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: projectColor }}
              />
              <span className="truncate">{projectName}</span>
            </span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="font-mono text-[11px] uppercase opacity-80">
              {projectSlug ? `${projectSlug}-` : ""}
              {ticketId}
            </span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="truncate text-foreground/80">{ticket.title}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={comingSoon("Favorites")}
              aria-label="Star ticket"
            >
              <Star className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={comingSoon("Ticket actions")}
              aria-label="More actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="px-10 py-8">
              {isEditingTitle ? (
                <Input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelTitle();
                    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      commitTitle();
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      commitTitle();
                    }
                  }}
                  aria-label="Ticket title"
                  className="h-auto border-0 bg-transparent p-0 text-[26px] font-semibold leading-tight shadow-none focus-visible:ring-0 md:text-[26px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="block w-full text-left text-[26px] font-semibold leading-tight tracking-tight text-foreground hover:opacity-90"
                  aria-label="Edit title"
                >
                  {ticket.title}
                </button>
              )}

              <div className="mt-6">
                {isEditingDescription ? (
                  <Textarea
                    autoFocus
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    onBlur={commitDescription}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelDescription();
                      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        commitDescription();
                      }
                    }}
                    placeholder="Add description…"
                    aria-label="Ticket description"
                    className="min-h-[140px] border-0 bg-transparent p-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[14px]"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingDescription(true)}
                    className={cn(
                      "block w-full text-left",
                      !ticket.description && "text-muted-foreground hover:text-foreground/80",
                    )}
                    aria-label="Edit description"
                  >
                    {ticket.description ? (
                      renderDescription(ticket.description)
                    ) : (
                      <span className="text-[14px]">Add description…</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-auto border-t border-border/60 px-10 py-6">
              <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Activity
              </div>
              <ul className="space-y-2 text-[13px] text-muted-foreground">
                <li>
                  <span className="text-foreground">Created</span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span>{formatDistanceToNowStrict(createdAt, { addSuffix: false })} ago</span>
                </li>
                {wasEdited ? (
                  <li>
                    <span className="text-foreground">Edited</span>
                    <span className="mx-1.5 opacity-60">·</span>
                    <span>{formatDistanceToNowStrict(updatedAt, { addSuffix: false })} ago</span>
                  </li>
                ) : null}
              </ul>
              <div className="mt-4 flex items-end gap-2">
                <Textarea
                  disabled
                  placeholder="Comments coming soon"
                  rows={2}
                  className="min-h-[44px] resize-none text-[13px]"
                  aria-label="Leave a comment"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled
                  aria-label="Send comment"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-border/60 bg-muted/20 px-4 py-6">
            <section>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Properties
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: statusColor }}
                  />
                  <span className="text-foreground">{statusName}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start gap-2 px-2 text-[13px] font-normal text-muted-foreground"
                  onClick={comingSoon("Priority")}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-current" />
                  Set priority
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start gap-2 px-2 text-[13px] font-normal text-muted-foreground"
                  onClick={comingSoon("Assignees")}
                >
                  <User2 className="h-3.5 w-3.5" />
                  Assign
                </Button>
              </div>
            </section>

            <section>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Labels
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 px-2 text-[13px] font-normal text-muted-foreground"
                onClick={comingSoon("Labels")}
              >
                <Tag className="h-3.5 w-3.5" />
                Add label
              </Button>
            </section>

            <section>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Project
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: projectColor }}
                />
                <span className="truncate text-foreground">{projectName}</span>
              </div>
            </section>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

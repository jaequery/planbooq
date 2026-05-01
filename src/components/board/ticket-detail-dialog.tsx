"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { GitPullRequest, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTicket } from "@/actions/ticket";
import { AssigneeAvatar, AssigneePicker } from "@/components/board/assignee-picker";
import { DueDatePicker } from "@/components/board/due-date-picker";
import { LabelPicker } from "@/components/board/label-picker";
import { PriorityPicker } from "@/components/board/priority-picker";
import { type StatusOption, StatusPicker } from "@/components/board/status-picker";
import { TicketActionsMenu } from "@/components/board/ticket-actions-menu";
import { TicketComments } from "@/components/board/ticket-comments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import type { Priority, TicketAssignee, TicketLabel, TicketWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticket: TicketWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (ticket: TicketWithRelations) => void;
  onDeleted?: (ticketId: string) => void;
  statuses: ReadonlyArray<StatusOption>;
  projectName: string;
  projectColor: string;
  projectSlug?: string;
  currentUserId: string | null;
};

function ActivityAvatar(): React.ReactElement {
  return <div aria-hidden className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/30" />;
}

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
  statuses,
  projectName,
  projectColor,
  projectSlug,
  currentUserId,
}: Props): React.ReactElement {
  const [, startTransition] = useTransition();
  const [titleDraft, setTitleDraft] = useState(ticket.title);
  const [descriptionDraft, setDescriptionDraft] = useState(ticket.description ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Optimistic mirrors of relational fields.
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [assignee, setAssignee] = useState<TicketAssignee | null>(ticket.assignee ?? null);
  const [labels, setLabels] = useState<TicketLabel[]>(ticket.labels ?? []);
  const [dueDate, setDueDate] = useState<Date | null>(
    ticket.dueDate ? new Date(ticket.dueDate) : null,
  );
  const [prUrlDraft, setPrUrlDraft] = useState(ticket.prUrl ?? "");
  const [isEditingPrUrl, setIsEditingPrUrl] = useState(false);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(ticket.title);
    if (!isEditingDescription) setDescriptionDraft(ticket.description ?? "");
  }, [ticket.title, ticket.description, isEditingTitle, isEditingDescription]);

  useEffect(() => {
    setPriority(ticket.priority);
    setAssignee(ticket.assignee ?? null);
    setLabels(ticket.labels ?? []);
    setDueDate(ticket.dueDate ? new Date(ticket.dueDate) : null);
  }, [ticket.priority, ticket.assignee, ticket.labels, ticket.dueDate]);

  useEffect(() => {
    if (!isEditingPrUrl) setPrUrlDraft(ticket.prUrl ?? "");
  }, [ticket.prUrl, isEditingPrUrl]);

  const commitPrUrl = (): void => {
    setIsEditingPrUrl(false);
    const original = ticket.prUrl ?? "";
    const next = prUrlDraft.trim();
    if (next === original) return;
    if (next && !/^https?:\/\//i.test(next)) {
      setPrUrlDraft(original);
      toast.error("PR URL must start with http(s)://");
      return;
    }
    startTransition(async () => {
      const result = await updateTicket({
        ticketId: ticket.id,
        prUrl: next ? next : null,
      });
      if (!result.ok) {
        setPrUrlDraft(original);
        toast.error(`Could not update PR URL: ${result.error}`);
        return;
      }
      onUpdated(result.data);
    });
  };

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
        description: nextDescription.trim() ? nextDescription : null,
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

  const handleDeleted = (): void => {
    onOpenChange(false);
    onDeleted?.(ticket.id);
  };

  const isOverdue = (() => {
    if (!dueDate) return false;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return dueDate.getTime() < start.getTime();
  })();

  const createdAt = new Date(ticket.createdAt);
  const updatedAt = new Date(ticket.updatedAt);
  const wasEdited = updatedAt.getTime() - createdAt.getTime() > 1000;
  const ticketIdLabel = `${projectSlug?.slice(0, 4).toUpperCase() ?? "TKT"}-${ticket.id.slice(-6).toUpperCase()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]"
      >
        <DialogTitle className="sr-only">{ticket.title}</DialogTitle>
        <DialogDescription className="sr-only">Ticket detail for {ticket.title}</DialogDescription>

        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: projectColor }}
              />
              <span className="truncate">{projectName}</span>
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-mono text-[11px] uppercase opacity-80">{ticketIdLabel}</span>
            {assignee ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <AssigneeAvatar
                    name={assignee.name}
                    email={assignee.email}
                    image={assignee.image}
                    size="xs"
                  />
                  <span className="truncate text-foreground">
                    {assignee.name ?? assignee.email ?? "Assignee"}
                  </span>
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <TicketActionsMenu
              ticketId={ticket.id}
              ticketTitle={ticket.title}
              projectSlug={projectSlug}
              onDeleted={handleDeleted}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="px-8 py-6">
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
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      commitTitle();
                    }
                  }}
                  aria-label="Ticket title"
                  className="h-auto border-0 bg-transparent p-0 text-[22px] font-semibold leading-tight tracking-tight shadow-none focus-visible:ring-0 md:text-[22px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="block w-full text-left text-[22px] font-semibold leading-tight tracking-tight text-foreground hover:opacity-90"
                  aria-label={`Edit title: ${ticket.title}`}
                >
                  {ticket.title}
                </button>
              )}

              <div className="mt-4">
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
                      <Markdown className="text-[14px] text-foreground">
                        {ticket.description}
                      </Markdown>
                    ) : (
                      <span className="text-[14px]">Add description…</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-auto border-t border-border/60 px-8 py-6">
              <div className="mb-3 text-[13px] font-medium text-foreground">Activity</div>
              <ul className="space-y-2 text-[13px] text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ActivityAvatar />
                  <span className="text-foreground">You created the issue</span>
                  <span className="opacity-60">·</span>
                  <span>{formatDistanceToNowStrict(createdAt, { addSuffix: false })} ago</span>
                </li>
                {wasEdited ? (
                  <li className="flex items-center gap-2">
                    <ActivityAvatar />
                    <span className="text-foreground">You edited the issue</span>
                    <span className="opacity-60">·</span>
                    <span>{formatDistanceToNowStrict(updatedAt, { addSuffix: false })} ago</span>
                  </li>
                ) : null}
              </ul>
              <div className="mt-4 border-t border-border/60 pt-4">
                <TicketComments
                  ticketId={ticket.id}
                  workspaceId={ticket.workspaceId}
                  currentUserId={currentUserId}
                />
              </div>
            </div>
          </div>

          <aside className="flex w-[280px] shrink-0 flex-col gap-1 overflow-y-auto border-l border-border px-4 py-6">
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Status</span>
              <StatusPicker
                ticketId={ticket.id}
                value={ticket.statusId}
                options={statuses}
                onChange={(next) => onUpdated({ ...ticket, statusId: next.id })}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Priority</span>
              <PriorityPicker ticketId={ticket.id} value={priority} onChange={setPriority} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Assignee</span>
              <AssigneePicker
                ticketId={ticket.id}
                workspaceId={ticket.workspaceId}
                assignee={assignee}
                onChange={setAssignee}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Labels</span>
              <LabelPicker
                ticketId={ticket.id}
                workspaceId={ticket.workspaceId}
                value={labels}
                onChange={setLabels}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Project</span>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: projectColor }}
                />
                <span className="truncate text-foreground">{projectName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Due date</span>
              <DueDatePicker
                ticketId={ticket.id}
                value={dueDate}
                onChange={setDueDate}
                overdue={isOverdue}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">PR</span>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
                <GitPullRequest
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {isEditingPrUrl ? (
                  <Input
                    autoFocus
                    value={prUrlDraft}
                    onChange={(e) => setPrUrlDraft(e.target.value)}
                    onBlur={commitPrUrl}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setPrUrlDraft(ticket.prUrl ?? "");
                        setIsEditingPrUrl(false);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        commitPrUrl();
                      }
                    }}
                    placeholder="https://github.com/.../pull/123"
                    aria-label="PR URL"
                    className="h-6 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
                  />
                ) : ticket.prUrl ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <a
                      href={ticket.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={ticket.prUrl}
                      className="truncate text-foreground hover:underline"
                    >
                      {ticket.prUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsEditingPrUrl(true)}
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="Edit PR URL"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingPrUrl(true)}
                    className="flex-1 text-left text-muted-foreground hover:text-foreground"
                  >
                    Add PR link…
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { GitMerge, GitPullRequest, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getPullRequestStatus, mergePullRequest } from "@/actions/github-pr";
import { updateTicket } from "@/actions/ticket";
import { AssigneeAvatar, AssigneePicker } from "@/components/board/assignee-picker";
import { DueDatePicker } from "@/components/board/due-date-picker";
import { LabelPicker } from "@/components/board/label-picker";
import { PriorityPicker } from "@/components/board/priority-picker";
import { type StatusOption, StatusPicker } from "@/components/board/status-picker";
import { TicketActionsMenu } from "@/components/board/ticket-actions-menu";
import { TicketActivityFeed } from "@/components/board/ticket-activity-feed";
import { TicketAgentPanel } from "@/components/board/ticket-agent-panel";
import { TicketPreviewsPanel } from "@/components/board/ticket-previews-panel";
import { TicketTimeline } from "@/components/board/ticket-timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ImageUploadTextarea } from "@/components/ui/image-upload-textarea";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { formatTicketIdentifier } from "@/lib/ticket-identifier";
import type { Priority, TicketAssignee, TicketLabel, TicketWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PrStatus } from "@/server/services/github-pr";

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

type PrStatusReason =
  | "no-pr-url"
  | "not-github"
  | "no-token"
  | "missing-scope"
  | "not-found"
  | "rate-limited"
  | "error";

function isGitHubPrUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "github.com" && /^\/[^/]+\/[^/]+\/pull\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

function describeStatusBadge(status: PrStatus): {
  label: string;
  tone: "merged" | "neutral" | "warn";
} {
  if (status.merged) return { label: "Merged", tone: "merged" };
  if (status.state === "closed") return { label: "Closed", tone: "neutral" };
  if (status.draft) return { label: "Draft", tone: "neutral" };
  if (status.mergeable === false) return { label: "Conflicts", tone: "warn" };
  if (status.mergeable === null) return { label: "Checking…", tone: "neutral" };
  if (status.mergeableState === "blocked") return { label: "Blocked", tone: "warn" };
  if (status.mergeableState === "behind") return { label: "Behind base", tone: "warn" };
  return { label: "Open", tone: "neutral" };
}

function describeReasonBadge(reason: PrStatusReason): string {
  switch (reason) {
    case "missing-scope":
    case "no-token":
      return "Auth needed";
    case "not-found":
      return "Not found";
    case "rate-limited":
      return "Rate limited";
    case "error":
      return "Error";
    default:
      return "Unavailable";
  }
}

function describeMergeDisabledReason(status: PrStatus): string | null {
  if (status.merged) return "PR already merged";
  if (status.state === "closed") return "PR is closed";
  if (status.draft) return "PR is in draft";
  if (status.mergeable === false) return "PR has conflicts";
  if (status.mergeable === null) return "Mergeability still computing";
  if (status.mergeableState === "blocked") return "Merge blocked by branch protection";
  if (status.mergeableState === "dirty") return "PR has conflicts";
  if (status.mergeableState === "behind") return "PR is behind the base branch";
  return null;
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
  const [prStatus, setPrStatus] = useState<PrStatus | null>(null);
  const [prStatusReason, setPrStatusReason] = useState<PrStatusReason | null>(null);
  const [isFetchingStatus, startStatusTransition] = useTransition();
  const [mergePending, startMergeTransition] = useTransition();
  const [mergeError, setMergeError] = useState<React.ReactNode | null>(null);

  const ticketPrUrl = ticket.prUrl;
  const showPrStatus = open && isGitHubPrUrl(ticketPrUrl);

  const loadStatus = useCallback((): void => {
    startStatusTransition(async () => {
      const result = await getPullRequestStatus(ticket.id);
      if (!result.ok) {
        setPrStatus(null);
        setPrStatusReason("error");
        return;
      }
      if (result.data.status === null) {
        setPrStatus(null);
        setPrStatusReason(result.data.reason);
        return;
      }
      setPrStatus(result.data.status);
      setPrStatusReason(null);
    });
  }, [ticket.id]);

  useEffect(() => {
    if (!showPrStatus) {
      setPrStatus(null);
      setPrStatusReason(null);
      setMergeError(null);
      return;
    }
    let cancelled = false;
    startStatusTransition(async () => {
      const result = await getPullRequestStatus(ticket.id);
      if (cancelled) return;
      if (!result.ok) {
        setPrStatus(null);
        setPrStatusReason("error");
        return;
      }
      if (result.data.status === null) {
        setPrStatus(null);
        setPrStatusReason(result.data.reason);
        return;
      }
      setPrStatus(result.data.status);
      setPrStatusReason(null);
    });
    return () => {
      cancelled = true;
    };
  }, [showPrStatus, ticket.id, ticketPrUrl]);

  const handleMerge = (): void => {
    setMergeError(null);
    startMergeTransition(async () => {
      const result = await mergePullRequest(ticket.id);
      if (!result.ok) {
        toast.error(result.error);
        setMergeError("Merge failed. Try again.");
        return;
      }
      if (result.data.merged === true) {
        toast.success("PR merged. Ticket will move to Completed shortly.");
        loadStatus();
        return;
      }
      const { reason, message } = result.data;
      let inline: React.ReactNode;
      let toastMsg: string;
      switch (reason) {
        case "missing-scope":
          toastMsg = "Re-authorize GitHub to enable merging from Planbooq.";
          inline = (
            <span>
              Re-authorize GitHub to enable merging from Planbooq.{" "}
              <a href="/api/auth/signin/github" className="underline">
                Re-authorize
              </a>
            </span>
          );
          break;
        case "no-token":
          toastMsg = "Connect your GitHub account to merge from Planbooq.";
          inline = toastMsg;
          break;
        case "not-mergeable":
          toastMsg = `GitHub refused the merge: ${message ?? "not mergeable"}`;
          inline = toastMsg;
          break;
        case "conflict":
          toastMsg = "PR is out of date with the base branch.";
          inline = toastMsg;
          break;
        case "rate-limited":
          toastMsg = "GitHub rate limit hit. Try again in a moment.";
          inline = toastMsg;
          break;
        case "no-pr-url":
        case "not-github":
          toastMsg = message ?? "Merge failed.";
          inline = toastMsg;
          break;
        default:
          toastMsg = message ?? "Merge failed.";
          inline = toastMsg;
          break;
      }
      toast.error(toastMsg);
      setMergeError(inline);
    });
  };

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
  const ticketIdLabel = formatTicketIdentifier(projectSlug, ticket.id);

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
                  <ImageUploadTextarea
                    workspaceId={ticket.workspaceId}
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
                    onUploadError={(message) => toast.error(`Image upload failed: ${message}`)}
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

            <div className="mt-auto flex flex-col gap-4 border-t border-border/60 px-8 py-6">
              <TicketActivityFeed ticketId={ticket.id} workspaceId={ticket.workspaceId} />
              <TicketAgentPanel
                ticketId={ticket.id}
                workspaceId={ticket.workspaceId}
                title={ticket.title}
                description={ticket.description ?? null}
              />
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
            <div className="flex flex-col gap-2">
              {ticket.prUrl ? (
                <>
                  {showPrStatus && prStatus ? (
                    (() => {
                      const badge = describeStatusBadge(prStatus);
                      const disabledReason = describeMergeDisabledReason(prStatus);
                      const disabled = isFetchingStatus || mergePending || disabledReason !== null;
                      return (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            asChild
                            className="h-9 justify-center text-[13px] font-medium"
                          >
                            <a
                              href={ticket.prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={ticket.prUrl}
                            >
                              <GitPullRequest className="mr-1.5 h-4 w-4" aria-hidden />
                              View PR
                            </a>
                          </Button>
                          <Button
                            type="button"
                            onClick={handleMerge}
                            disabled={disabled}
                            title={mergePending ? "Merging…" : (disabledReason ?? "Merge this PR")}
                            className="h-9 justify-center text-[13px] font-medium"
                          >
                            <GitMerge className="mr-1.5 h-4 w-4" aria-hidden />
                            {mergePending
                              ? "Merging…"
                              : badge.tone === "merged"
                                ? "Merged"
                                : "Merge"}
                          </Button>
                        </div>
                      );
                    })()
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      asChild
                      className="h-9 w-full justify-center text-[13px] font-medium"
                    >
                      <a
                        href={ticket.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={ticket.prUrl}
                      >
                        <GitPullRequest className="mr-1.5 h-4 w-4" aria-hidden />
                        View PR
                        {showPrStatus && prStatusReason ? (
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            {describeReasonBadge(prStatusReason)}
                          </span>
                        ) : null}
                      </a>
                    </Button>
                  )}
                </>
              ) : null}
              {mergeError ? (
                <div className="text-[12px] text-red-600 dark:text-red-400">{mergeError}</div>
              ) : null}
            </div>
            <TicketPreviewsPanel ticketId={ticket.id} workspaceId={ticket.workspaceId} />
            <div className="mt-4 border-t border-border/60 pt-4">
              <TicketTimeline
                ticketId={ticket.id}
                workspaceId={ticket.workspaceId}
                currentUserId={currentUserId}
                createdAt={createdAt}
                updatedAt={updatedAt}
                wasEdited={wasEdited}
              />
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

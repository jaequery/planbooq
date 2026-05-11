"use client";

import { ChevronDown, GitMerge, GitPullRequest, Pencil, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getPullRequestStatus,
  mergePullRequest,
  requestMergeConflictFix,
} from "@/actions/github-pr";
import { updateTicket } from "@/actions/ticket";
import { AgentProfilesPicker } from "@/components/board/agent-profiles-picker";
import { AssigneeAvatar, AssigneePicker } from "@/components/board/assignee-picker";
import { DueDatePicker } from "@/components/board/due-date-picker";
import { LabelPicker } from "@/components/board/label-picker";
import { PriorityPicker } from "@/components/board/priority-picker";
import { type StatusOption, StatusPicker } from "@/components/board/status-picker";
import { TicketActionsMenu } from "@/components/board/ticket-actions-menu";
import { TicketAgentPanel } from "@/components/board/ticket-agent-panel";
import { TicketPreviewsPanel } from "@/components/board/ticket-previews-panel";
import { TicketTimeline } from "@/components/board/ticket-timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ImageUploadTextarea } from "@/components/ui/image-upload-textarea";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { formatTicketIdentifier } from "@/lib/ticket-identifier";
import type {
  Priority,
  TicketAssignee,
  TicketLabel,
  TicketPullRequest,
  TicketWithRelations,
} from "@/lib/types";
import { getDesktopBridge } from "@/lib/use-is-desktop";
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
  autoRunAction?: boolean;
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

function hasMergeConflict(status: PrStatus): boolean {
  if (status.merged) return false;
  if (status.state === "closed") return false;
  return status.mergeable === false || status.mergeableState === "dirty";
}

const MAX_FIX_ATTEMPTS = 5;

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
  autoRunAction,
}: Props): React.ReactElement {
  const [, startTransition] = useTransition();
  const [titleDraft, setTitleDraft] = useState(ticket.title);
  const [descriptionDraft, setDescriptionDraft] = useState(ticket.description ?? "");
  const [planDraft, setPlanDraft] = useState(ticket.plan ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
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
  const [fixState, setFixState] = useState<
    | { phase: "idle" }
    | { phase: "dispatching"; attempt: number }
    | { phase: "resolving"; attempt: number }
    | { phase: "retrying"; attempt: number }
    | { phase: "failed"; attempt: number; reason: string }
  >({ phase: "idle" });

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
    const fetchOnce = async (): Promise<void> => {
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
    };
    startStatusTransition(() => {
      void fetchOnce();
    });
    const interval = setInterval(() => {
      void fetchOnce();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
        toast.success("PR merged.");
        // Optimistically move the ticket to Completed so the board reflects
        // the merge instantly. The server already moved it via
        // autoCompleteTicketByPrUrl and an Ably ticket.moved is in flight;
        // the echo just reconciles whatever we set here.
        const completed = statuses.find(
          (s) => s.key === "completed" || s.name.toLowerCase() === "completed",
        );
        if (completed && completed.id !== ticket.statusId) {
          onUpdated({ ...ticket, statusId: completed.id });
        }
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

  const dispatchFixMerge = useCallback(
    (attempt: number): void => {
      setMergeError(null);
      setFixState({ phase: "dispatching", attempt });

      // Prefer the in-ticket chat (local Claude Code via the desktop bridge):
      // the agent panel listens for `planbooq:workflow-run` and runs the prompt
      // there, so progress streams into the chat instead of disappearing into a
      // remote paired-agent job.
      const prUrl = ticket.prUrl;
      const prNumberMatch = prUrl ? prUrl.match(/\/pull\/(\d+)/) : null;
      const bridge = getDesktopBridge();
      if (bridge && prUrl && prNumberMatch) {
        const prNumber = prNumberMatch[1];
        const prompt = [
          `# Resolve merge conflicts on PR #${prNumber}`,
          ``,
          `Ticket: ${ticket.title}`,
          `PR URL: ${prUrl}`,
          `Attempt: ${attempt} of ${MAX_FIX_ATTEMPTS}`,
          ``,
          `The pull request has merge conflicts with its base branch.`,
          `Check out the PR branch, merge (or rebase) the base branch into it,`,
          `resolve every conflict using your best judgment, run typecheck/lint,`,
          `commit the resolution, and push the branch so the PR becomes mergeable.`,
          ``,
          `Steps:`,
          `1. gh pr checkout ${prNumber}`,
          `2. Detect base branch and merge it (e.g. \`git fetch origin && git merge origin/<base>\`).`,
          `3. Resolve each conflict — preserve intent from both sides.`,
          `4. \`pnpm typecheck && pnpm lint\` — fix any new issues caused by the merge.`,
          `5. Commit with a clear message and push.`,
          `6. Do NOT merge or close the PR; only resolve conflicts and push.`,
        ].join("\n");
        window.dispatchEvent(
          new CustomEvent("planbooq:workflow-run", {
            detail: { ticketId: ticket.id, prompts: [prompt] },
          }),
        );
        setFixState({ phase: "resolving", attempt });
        toast.message("Claude is resolving conflicts");
        return;
      }

      // Web fallback: dispatch to a paired remote agent via the server action.
      void (async () => {
        const result = await requestMergeConflictFix(ticket.id, attempt);
        if (!result.ok) {
          const reason =
            result.error === "no_agent_paired"
              ? "No paired Planbooq agent available. Open this ticket in the desktop app to use the local chat, or pair an agent in Settings → Agents."
              : result.error === "no_pr_url"
                ? "No PR URL on this ticket."
                : `Could not dispatch Claude: ${result.error}`;
          setFixState({ phase: "failed", attempt, reason });
          toast.error(reason);
          return;
        }
        setFixState({ phase: "resolving", attempt });
        toast.message("Claude is resolving conflicts");
      })();
    },
    [ticket.id, ticket.prUrl, ticket.title],
  );

  const handleFixMerge = (): void => {
    dispatchFixMerge(1);
  };

  // Watch PR status while a fix is in flight: when the branch becomes
  // mergeable, auto-retry the merge; if it lands as a conflict again,
  // re-dispatch Claude up to MAX_FIX_ATTEMPTS.
  useEffect(() => {
    if (!prStatus) return;
    if (fixState.phase !== "resolving") return;
    if (prStatus.merged) {
      setFixState({ phase: "idle" });
      return;
    }
    if (prStatus.mergeable === true) {
      const attempt = fixState.attempt;
      setFixState({ phase: "retrying", attempt });
      startMergeTransition(async () => {
        const result = await mergePullRequest(ticket.id);
        if (result.ok && result.data.merged === true) {
          toast.success("PR merged after Claude resolved conflicts.");
          setFixState({ phase: "idle" });
          loadStatus();
          return;
        }
        if (result.ok && result.data.merged === false && result.data.reason === "conflict") {
          if (attempt >= MAX_FIX_ATTEMPTS) {
            setFixState({
              phase: "failed",
              attempt,
              reason: "Still conflicted. Resolve manually.",
            });
            toast.error("Fix Merge gave up.");
            return;
          }
          dispatchFixMerge(attempt + 1);
          return;
        }
        const reason = !result.ok
          ? result.error
          : result.data.merged === false
            ? (result.data.message ?? `Merge retry failed: ${result.data.reason}`)
            : "Merge retry failed";
        setFixState({ phase: "failed", attempt, reason });
        toast.error(reason);
      });
      return;
    }
    if (prStatus.mergeable === false && fixState.attempt > 0) {
      // Branch is conflicted again after Claude's push; if the agent already
      // ran and pushed (we'd see mergeable flip true→false), step up.
      // Otherwise the agent is still working — keep waiting.
    }
  }, [prStatus, fixState, ticket.id, loadStatus, dispatchFixMerge]);

  // Reset fix flow when PR becomes mergeable, merged, or the dialog closes.
  useEffect(() => {
    if (!showPrStatus) setFixState({ phase: "idle" });
  }, [showPrStatus]);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(ticket.title);
    if (!isEditingDescription) setDescriptionDraft(ticket.description ?? "");
    if (!isEditingPlan) setPlanDraft(ticket.plan ?? "");
  }, [
    ticket.title,
    ticket.description,
    ticket.plan,
    isEditingTitle,
    isEditingDescription,
    isEditingPlan,
  ]);

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
      setIsEditingPlan(false);
    }
  }, [open]);

  const persist = (
    next: { title?: string; description?: string; plan?: string },
    rollback: () => void,
  ): void => {
    startTransition(async () => {
      const nextTitle = (next.title ?? ticket.title).trim();
      const nextDescription = next.description ?? ticket.description ?? "";
      const nextPlan = next.plan ?? ticket.plan ?? "";
      const result = await updateTicket({
        ticketId: ticket.id,
        title: nextTitle,
        description: nextDescription.trim() ? nextDescription : null,
        plan: nextPlan.trim() ? nextPlan : null,
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

  const commitPlan = (): void => {
    setIsEditingPlan(false);
    const original = ticket.plan ?? "";
    if (planDraft === original) return;
    persist({ plan: planDraft }, () => setPlanDraft(original));
  };

  const cancelPlan = (): void => {
    setPlanDraft(ticket.plan ?? "");
    setIsEditingPlan(false);
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

              <div className="mt-8 rounded-md border border-border/60 border-l-2 border-l-primary/60 bg-muted/40 px-4 py-3">
                {(() => {
                  const planText = ticket.plan ?? "";
                  const isLong = planText.length > 280 || planText.split("\n").length > 6;
                  const showCollapsed =
                    !isEditingPlan && !!ticket.plan && isLong && !isPlanExpanded;
                  return (
                    <>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                          Plan
                        </div>
                        {!isEditingPlan ? (
                          <div className="flex items-center gap-1">
                            {ticket.plan && isLong ? (
                              <button
                                type="button"
                                onClick={() => setIsPlanExpanded((v) => !v)}
                                aria-expanded={isPlanExpanded}
                                aria-label={isPlanExpanded ? "Collapse plan" : "Expand plan"}
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <span>{isPlanExpanded ? "Show less" : "Show more"}</span>
                                <ChevronDown
                                  className={cn(
                                    "h-3.5 w-3.5 transition-transform",
                                    isPlanExpanded && "rotate-180",
                                  )}
                                />
                              </button>
                            ) : null}
                            {ticket.plan ? (
                              <button
                                type="button"
                                onClick={() => setIsEditingPlan(true)}
                                aria-label="Edit plan"
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span>Edit</span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {isEditingPlan ? (
                        <ImageUploadTextarea
                          workspaceId={ticket.workspaceId}
                          autoFocus
                          value={planDraft}
                          onChange={(e) => setPlanDraft(e.target.value)}
                          onBlur={commitPlan}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelPlan();
                            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              commitPlan();
                            }
                          }}
                          onUploadError={(message) =>
                            toast.error(`Image upload failed: ${message}`)
                          }
                          placeholder="Add or paste an implementation plan…"
                          aria-label="Ticket plan"
                          className="min-h-[140px] border-0 bg-transparent p-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[14px]"
                        />
                      ) : ticket.plan ? (
                        showCollapsed ? (
                          <button
                            type="button"
                            onClick={() => setIsPlanExpanded(true)}
                            aria-label="Expand plan"
                            aria-expanded={false}
                            className="block w-full text-left"
                          >
                            <div className="relative max-h-[7.5rem] overflow-hidden">
                              <Markdown className="text-[14px] text-foreground">
                                {ticket.plan}
                              </Markdown>
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-muted/90 to-transparent" />
                            </div>
                          </button>
                        ) : (
                          <div className="block w-full text-left">
                            <Markdown className="text-[14px] text-foreground">
                              {ticket.plan}
                            </Markdown>
                          </div>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditingPlan(true)}
                          className="block w-full text-left text-muted-foreground hover:text-foreground/80"
                          aria-label="Add plan"
                        >
                          <span className="text-[14px]">
                            No plan yet. Generate one or write your own…
                          </span>
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="mt-6 border-t border-border/60 px-8 py-6">
              <TicketAgentPanel
                key={ticket.id}
                ticketId={ticket.id}
                workspaceId={ticket.workspaceId}
                projectId={ticket.projectId}
                title={ticket.title}
                description={ticket.description ?? null}
                identifier={ticketIdLabel}
                statusKey={statuses.find((s) => s.id === ticket.statusId)?.key}
                autoRunAction={autoRunAction}
              />
            </div>
          </div>

          <aside className="flex w-[360px] shrink-0 flex-col gap-1 overflow-y-auto border-l border-border px-4 py-6">
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
              <span className="w-[80px] shrink-0 text-[12px] text-muted-foreground">Agents</span>
              <AgentProfilesPicker ticketId={ticket.id} workspaceId={ticket.workspaceId} />
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
                      const conflict = hasMergeConflict(prStatus);
                      const fixActive =
                        fixState.phase === "dispatching" ||
                        fixState.phase === "resolving" ||
                        fixState.phase === "retrying";
                      const showFixButton = (conflict || fixActive) && !prStatus.merged;
                      const showMergeButton = !prStatus.merged;
                      const disabled = isFetchingStatus || mergePending || disabledReason !== null;
                      const badgeClass =
                        badge.tone === "warn"
                          ? "bg-destructive/10 text-destructive"
                          : badge.tone === "merged"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground";
                      return (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-muted-foreground">PR status</span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                              title={disabledReason ?? undefined}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div
                            className={
                              showMergeButton ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"
                            }
                          >
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
                            {!showMergeButton ? null : showFixButton ? (
                              <Button
                                type="button"
                                onClick={handleFixMerge}
                                disabled={fixActive || mergePending}
                                title={
                                  fixActive
                                    ? "Claude is resolving merge conflicts"
                                    : "Ask Claude to resolve merge conflicts and retry"
                                }
                                className="h-9 justify-center text-[13px] font-medium"
                              >
                                <Wand2 className="mr-1.5 h-4 w-4" aria-hidden />
                                {fixState.phase === "dispatching"
                                  ? "Dispatching…"
                                  : fixState.phase === "resolving"
                                    ? "Resolving…"
                                    : fixState.phase === "retrying"
                                      ? "Retrying merge…"
                                      : "Fix Merge"}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                onClick={handleMerge}
                                disabled={disabled}
                                title={
                                  mergePending ? "Merging…" : (disabledReason ?? "Merge this PR")
                                }
                                className="h-9 justify-center text-[13px] font-medium"
                              >
                                <GitMerge className="mr-1.5 h-4 w-4" aria-hidden />
                                {mergePending ? "Merging…" : "Merge"}
                              </Button>
                            )}
                          </div>
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
              {fixState.phase === "dispatching" ||
              fixState.phase === "resolving" ||
              fixState.phase === "retrying" ? (
                <div className="text-[12px] text-muted-foreground">
                  {fixState.phase === "dispatching"
                    ? "Dispatching Claude…"
                    : fixState.phase === "resolving"
                      ? "Claude is resolving conflicts. The PR will retry automatically once the branch is mergeable."
                      : "Branch is mergeable — retrying merge…"}
                </div>
              ) : null}
              {fixState.phase === "failed" ? (
                <div className="text-[12px] text-red-600 dark:text-red-400">
                  Fix Merge failed: {fixState.reason}
                </div>
              ) : null}
              <PullRequestHistory pullRequests={ticket.pullRequests} currentPrUrl={ticket.prUrl} />
            </div>
            <TicketPreviewsPanel ticketId={ticket.id} workspaceId={ticket.workspaceId} />

            <div className="mt-4 pt-4">
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

function prShortLabel(url: string): string {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (m) return `${m[2]}#${m[3]}`;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function PullRequestHistory({
  pullRequests,
  currentPrUrl,
}: {
  pullRequests?: TicketPullRequest[];
  currentPrUrl: string | null;
}): React.ReactElement | null {
  // Show whenever the ticket has any PR sibling to the current pointer.
  // The "View PR / Merge" block above only renders `ticket.prUrl`, so we
  // need this list to surface merged / superseded / additional PRs.
  if (!pullRequests || pullRequests.length === 0) return null;
  const hasSibling =
    pullRequests.length > 1 || (pullRequests[0] && pullRequests[0].url !== currentPrUrl);
  if (!hasSibling) return null;

  const toneFor = (status: TicketPullRequest["status"]): string => {
    switch (status) {
      case "MERGED":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "CLOSED":
        return "bg-muted text-muted-foreground";
      case "SUPERSEDED":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
      default:
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        PR history
      </span>
      <ul className="flex flex-col gap-1">
        {pullRequests.map((pr) => (
          <li key={pr.id} className="flex items-center justify-between gap-2 text-[12px]">
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              title={pr.url}
              className="truncate font-mono text-foreground hover:underline"
            >
              {prShortLabel(pr.url)}
            </a>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${toneFor(pr.status)}`}
            >
              {pr.status.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

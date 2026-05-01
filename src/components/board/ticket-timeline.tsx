"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Sparkles, Trash2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { listTicketAiMessages, runTicketAiCodeAgent, sendTicketAiMessage } from "@/actions/ai-chat";
import { createComment, deleteComment, listTicketComments } from "@/actions/comment";
import { AssigneeAvatar } from "@/components/board/assignee-picker";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CommentWithAuthor } from "@/server/services/comments";

type AiItem = {
  kind: "ai";
  id: string;
  role: "user" | "assistant" | "system" | string;
  body: string;
  authorId: string | null;
  createdAt: Date;
};

type CommentItem = {
  kind: "comment";
  id: string;
  body: string;
  authorId: string;
  createdAt: Date;
  author: CommentWithAuthor["author"] | null;
};

type ActivityItem = {
  kind: "activity";
  id: string;
  text: string;
  createdAt: Date;
};

type TimelineItem = AiItem | CommentItem | ActivityItem;

type Props = {
  ticketId: string;
  workspaceId: string;
  currentUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  wasEdited: boolean;
};

function ActivityAvatar(): React.ReactElement {
  return <div aria-hidden className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/30" />;
}

export function TicketTimeline({
  ticketId,
  workspaceId,
  currentUserId,
  createdAt,
  updatedAt,
  wasEdited,
}: Props): React.ReactElement {
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, startLoad] = useTransition();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"comment" | "ai">("comment");
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [isSubmitting, startSubmit] = useTransition();
  const [isRunning, startRun] = useTransition();

  useEffect(() => {
    let alive = true;
    startLoad(async () => {
      const [aiRes, commentRes] = await Promise.all([
        listTicketAiMessages(ticketId),
        listTicketComments(ticketId),
      ]);
      if (!alive) return;
      if (aiRes.ok) {
        setAiItems(
          aiRes.data.items.map((m) => ({
            kind: "ai" as const,
            id: m.id,
            role: m.role,
            body: m.body,
            authorId: m.authorId,
            createdAt: new Date(m.createdAt),
          })),
        );
      } else {
        toast.error(`Could not load AI thread: ${aiRes.error}`);
      }
      if (commentRes.ok) {
        setComments(
          commentRes.data.items.map((c) => ({
            kind: "comment" as const,
            id: c.id,
            body: c.body,
            authorId: c.authorId,
            createdAt: new Date(c.createdAt),
            author: c.author,
          })),
        );
      } else {
        toast.error(`Could not load comments: ${commentRes.error}`);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [ticketId]);

  const handleEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name === "ai.message.created" && event.ticketId === ticketId) {
        setAiItems((prev) => {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [
            ...prev,
            {
              kind: "ai",
              id: event.message.id,
              role: event.message.role,
              body: event.message.body,
              authorId: event.message.authorId,
              createdAt: new Date(event.message.createdAt),
            },
          ];
        });
        return;
      }
      if (event.name === "comment.created" && event.ticketId === ticketId) {
        setComments((prev) => {
          if (prev.some((c) => c.id === event.comment.id)) return prev;
          return [
            ...prev,
            {
              kind: "comment",
              id: event.comment.id,
              body: event.comment.body,
              authorId: event.comment.authorId,
              createdAt: new Date(event.comment.createdAt),
              author: null,
            },
          ];
        });
        return;
      }
      if (event.name === "comment.updated" && event.ticketId === ticketId) {
        setComments((prev) =>
          prev.map((c) => (c.id === event.comment.id ? { ...c, body: event.comment.body } : c)),
        );
        return;
      }
      if (event.name === "comment.deleted" && event.ticketId === ticketId) {
        setComments((prev) => prev.filter((c) => c.id !== event.commentId));
      }
    },
    [ticketId],
  );

  useBoardChannel(workspaceId, handleEvent);

  const merged = useMemo<TimelineItem[]>(() => {
    const activity: ActivityItem[] = [
      { kind: "activity", id: "created", text: "You created the issue", createdAt },
    ];
    if (wasEdited) {
      activity.push({
        kind: "activity",
        id: "edited",
        text: "You edited the issue",
        createdAt: updatedAt,
      });
    }
    const all: TimelineItem[] = commentsOnly
      ? [...activity, ...comments]
      : [...activity, ...aiItems, ...comments];
    return all.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [aiItems, comments, commentsOnly, createdAt, updatedAt, wasEdited]);

  const submit = (): void => {
    const body = draft.trim();
    if (!body || isSubmitting) return;
    if (mode === "comment") {
      startSubmit(async () => {
        const result = await createComment({ ticketId, body });
        if (!result.ok) {
          toast.error(`Could not post comment: ${result.error}`);
          return;
        }
        setComments((prev) =>
          prev.some((c) => c.id === result.data.id)
            ? prev
            : [
                ...prev,
                {
                  kind: "comment",
                  id: result.data.id,
                  body: result.data.body,
                  authorId: result.data.authorId,
                  createdAt: new Date(result.data.createdAt),
                  author: result.data.author,
                },
              ],
        );
        setDraft("");
      });
      return;
    }
    startSubmit(async () => {
      const result = await sendTicketAiMessage({ ticketId, body });
      if (!result.ok) {
        toast.error(`Could not send message: ${result.error}`);
        return;
      }
      setDraft("");
      const incoming: AiItem[] = [
        {
          kind: "ai",
          id: result.data.user.id,
          role: result.data.user.role,
          body: result.data.user.body,
          authorId: result.data.user.authorId,
          createdAt: new Date(result.data.user.createdAt),
        },
      ];
      if (result.data.assistant) {
        incoming.push({
          kind: "ai",
          id: result.data.assistant.id,
          role: result.data.assistant.role,
          body: result.data.assistant.body,
          authorId: result.data.assistant.authorId,
          createdAt: new Date(result.data.assistant.createdAt),
        });
      }
      setAiItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const next = [...prev];
        for (const m of incoming) if (!seen.has(m.id)) next.push(m);
        return next;
      });
      if (!result.data.assistant && result.data.assistantError) {
        const reason =
          result.data.assistantError === "no_key"
            ? "Add an OpenRouter key in workspace settings to get AI replies."
            : `AI reply failed: ${result.data.assistantError}`;
        toast.error(reason);
      }
    });
  };

  const removeComment = (commentId: string): void => {
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    void deleteComment(commentId).then((result) => {
      if (!result.ok) {
        setComments(previous);
        toast.error(`Could not delete comment: ${result.error}`);
      }
    });
  };

  const runAgent = (): void => {
    if (isRunning) return;
    startRun(async () => {
      const result = await runTicketAiCodeAgent(ticketId);
      if (!result.ok) {
        toast.error(`Could not start agent: ${result.error}`);
        return;
      }
      toast.success("Code agent run requested");
    });
  };

  const canSubmit = draft.trim().length > 0 && !isSubmitting;
  const placeholder =
    mode === "ai" ? "Ask the AI for a plan, a diff, or a commit…" : "Leave a comment…";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-foreground">Activity</div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={commentsOnly}
            onChange={(e) => setCommentsOnly(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Comments only
        </label>
      </div>

      {!loaded ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : (
        <ul className="space-y-3">
          {merged.map((item) => {
            if (item.kind === "activity") {
              return (
                <li key={item.id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <ActivityAvatar />
                  <span className="text-foreground">{item.text}</span>
                  <span className="opacity-60">·</span>
                  <span>{formatDistanceToNowStrict(item.createdAt, { addSuffix: false })} ago</span>
                </li>
              );
            }
            if (item.kind === "ai") {
              const isAssistant = item.role === "assistant";
              const isSystem = item.role === "system";
              const label = isAssistant ? "AI" : isSystem ? "System" : "You";
              return (
                <li key={item.id} className="flex gap-2">
                  <div className="pt-0.5">
                    {isAssistant ? (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Sparkles className="h-3 w-3" aria-hidden />
                      </div>
                    ) : isSystem ? (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Wand2 className="h-3 w-3" aria-hidden />
                      </div>
                    ) : (
                      <ActivityAvatar />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <span className="text-foreground">{label}</span>
                      <span className="opacity-60">·</span>
                      <span>
                        {formatDistanceToNowStrict(item.createdAt, { addSuffix: false })} ago
                      </span>
                    </div>
                    <Markdown className="text-[13px] text-foreground">{item.body}</Markdown>
                  </div>
                </li>
              );
            }
            const author = item.author;
            const displayName = author?.name ?? author?.email ?? "Someone";
            const isMine = currentUserId !== null && item.authorId === currentUserId;
            return (
              <li key={item.id} className="flex gap-2">
                <div className="pt-0.5">
                  {author ? (
                    <AssigneeAvatar
                      name={author.name}
                      email={author.email}
                      image={author.image}
                      size="sm"
                    />
                  ) : (
                    <ActivityAvatar />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="text-foreground">{displayName}</span>
                    <span className="opacity-60">·</span>
                    <span>
                      {formatDistanceToNowStrict(item.createdAt, { addSuffix: false })} ago
                    </span>
                    {isMine ? (
                      <button
                        type="button"
                        onClick={() => removeComment(item.id)}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <Markdown className="text-[13px] text-foreground">{item.body}</Markdown>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 pt-2">
        <div className="inline-flex rounded-md border border-border p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => setMode("comment")}
            className={cn(
              "rounded px-2.5 py-1",
              mode === "comment"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Comment
          </button>
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={cn(
              "rounded px-2.5 py-1",
              mode === "ai"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Ask AI
          </button>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={3}
          maxLength={10_000}
          aria-label={mode === "ai" ? "New AI message" : "New comment"}
          className="text-[13px]"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runAgent}
            disabled={isRunning}
            title="Run the code agent against this ticket"
          >
            <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden />
            {isRunning ? "Starting…" : "Run agent"}
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
            {isSubmitting
              ? mode === "ai"
                ? "Sending…"
                : "Posting…"
              : mode === "ai"
                ? "Send"
                : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

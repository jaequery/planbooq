"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createComment, deleteComment, listTicketComments } from "@/actions/comment";
import { AssigneeAvatar } from "@/components/board/assignee-picker";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";
import type { CommentWithAuthor } from "@/server/services/comments";

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

type TimelineItem = CommentItem | ActivityItem;

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
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, startLoad] = useTransition();
  const [draft, setDraft] = useState("");
  const [isSubmitting, startSubmit] = useTransition();

  useEffect(() => {
    let alive = true;
    startLoad(async () => {
      const commentRes = await listTicketComments(ticketId);
      if (!alive) return;
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
    return [...activity, ...comments].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [comments, createdAt, updatedAt, wasEdited]);

  const submit = (): void => {
    const body = draft.trim();
    if (!body || isSubmitting) return;
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

  const canSubmit = draft.trim().length > 0 && !isSubmitting;

  return (
    <div className="space-y-3">
      <div className="text-[13px] font-medium text-foreground">Activity</div>

      {!loaded ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : (
        <ul className="space-y-3">
          {merged.map((item) => {
            if (item.kind === "activity") {
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 text-[13px] text-muted-foreground"
                >
                  <ActivityAvatar />
                  <span className="text-foreground">{item.text}</span>
                  <span className="opacity-60">·</span>
                  <span>
                    {formatDistanceToNowStrict(item.createdAt, { addSuffix: false })} ago
                  </span>
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
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Leave a comment…"
          rows={3}
          maxLength={10_000}
          aria-label="New comment"
          className="text-[13px]"
        />
        <div className="flex items-center justify-end">
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
            {isSubmitting ? "Posting…" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

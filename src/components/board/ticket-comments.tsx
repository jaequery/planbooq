"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createComment, deleteComment, listTicketComments } from "@/actions/comment";
import { AssigneeAvatar } from "@/components/board/assignee-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";
import type { CommentWithAuthor } from "@/server/services/comments";

type Props = {
  ticketId: string;
  workspaceId: string;
  currentUserId: string | null;
};

type CommentItem = CommentWithAuthor | RealtimeComment;

type RealtimeComment = {
  id: string;
  body: string;
  authorId: string;
  ticketId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  author: null;
};

function sortByCreatedAsc(items: CommentItem[]): CommentItem[] {
  return [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function TicketComments({
  ticketId,
  workspaceId,
  currentUserId,
}: Props): React.ReactElement {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [isLoading, startLoad] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const result = await listTicketComments(ticketId);
      if (!result.ok) {
        toast.error(`Could not load comments: ${result.error}`);
        setLoaded(true);
        return;
      }
      setItems(sortByCreatedAsc(result.data.items));
      setLoaded(true);
    });
  }, [ticketId]);

  const handleEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name === "comment.created" && event.ticketId === ticketId) {
        setItems((prev) => {
          if (prev.some((c) => c.id === event.comment.id)) return prev;
          const incoming: RealtimeComment = {
            id: event.comment.id,
            body: event.comment.body,
            authorId: event.comment.authorId,
            ticketId,
            workspaceId,
            createdAt: new Date(event.comment.createdAt),
            updatedAt: new Date(event.comment.createdAt),
            author: null,
          };
          return sortByCreatedAsc([...prev, incoming]);
        });
        return;
      }
      if (event.name === "comment.updated" && event.ticketId === ticketId) {
        setItems((prev) =>
          prev.map((c) =>
            c.id === event.comment.id
              ? { ...c, body: event.comment.body, updatedAt: new Date(event.comment.updatedAt) }
              : c,
          ),
        );
        return;
      }
      if (event.name === "comment.deleted" && event.ticketId === ticketId) {
        setItems((prev) => prev.filter((c) => c.id !== event.commentId));
      }
    },
    [ticketId, workspaceId],
  );

  useBoardChannel(workspaceId, handleEvent);

  const submit = (): void => {
    const body = draft.trim();
    if (!body || isSubmitting) return;
    startSubmit(async () => {
      const result = await createComment({ ticketId, body });
      if (!result.ok) {
        toast.error(`Could not post comment: ${result.error}`);
        return;
      }
      setItems((prev) => {
        if (prev.some((c) => c.id === result.data.id)) return prev;
        return sortByCreatedAsc([...prev, result.data]);
      });
      setDraft("");
    });
  };

  const remove = (commentId: string): void => {
    const previous = items;
    setItems((prev) => prev.filter((c) => c.id !== commentId));
    void deleteComment(commentId).then((result) => {
      if (!result.ok) {
        setItems(previous);
        toast.error(`Could not delete comment: ${result.error}`);
      }
    });
  };

  const canSubmit = draft.trim().length > 0 && !isSubmitting;

  return (
    <div className="mt-4 space-y-3">
      {!loaded && isLoading ? (
        <div className="text-[12px] text-muted-foreground">Loading comments…</div>
      ) : items.length === 0 ? null : (
        <ul className="space-y-3">
          {items.map((comment) => {
            const author = "author" in comment ? comment.author : null;
            const displayName = author?.name ?? author?.email ?? "Someone";
            const isMine = currentUserId !== null && comment.authorId === currentUserId;
            return (
              <li key={comment.id} className="flex gap-2">
                <div className="pt-0.5">
                  {author ? (
                    <AssigneeAvatar
                      name={author.name}
                      email={author.email}
                      image={author.image}
                      size="sm"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/30"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="text-foreground">{displayName}</span>
                    <span className="opacity-60">·</span>
                    <span>
                      {formatDistanceToNowStrict(new Date(comment.createdAt), {
                        addSuffix: false,
                      })}{" "}
                      ago
                    </span>
                    {isMine ? (
                      <button
                        type="button"
                        onClick={() => remove(comment.id)}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">
                    {comment.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
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
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
            {isSubmitting ? "Posting…" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

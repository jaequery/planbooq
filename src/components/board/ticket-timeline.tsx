"use client";

import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  CirclePlay,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Hammer,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createComment, deleteComment, listTicketComments } from "@/actions/comment";
import { AssigneeAvatar } from "@/components/board/assignee-picker";
import { Button } from "@/components/ui/button";
import { ImageUploadTextarea } from "@/components/ui/image-upload-textarea";
import { Markdown } from "@/components/ui/markdown";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";
import type { CommentWithAuthor } from "@/server/services/comments";

type ServerActivity = {
  id: string;
  kind:
    | "PR_CREATED"
    | "PR_MERGED"
    | "COMMIT_PUSHED"
    | "TEST_RUN"
    | "BUILD"
    | "NOTE"
    | "STATUS_CHANGED"
    | "STEP_STARTED"
    | "STEP_COMPLETED";
  payload: Record<string, unknown>;
  jobId: string | null;
  createdAt: string;
};

type ActivityItem = {
  kind: "activity";
  id: string;
  createdAt: Date;
  text?: string;
  data?: ServerActivity;
};

type TimelineItem = CommentItem | ActivityItem;

type CommentItem = {
  kind: "comment";
  id: string;
  body: string;
  authorId: string;
  createdAt: Date;
  author: CommentWithAuthor["author"] | null;
};

type Props = {
  ticketId: string;
  workspaceId: string;
  currentUserId: string | null;
  createdAt: Date;
};

function ActivityAvatar(): React.ReactElement {
  return <div aria-hidden className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/30" />;
}

function renderServerActivity(a: ServerActivity): React.ReactElement {
  const p = a.payload;
  switch (a.kind) {
    case "PR_CREATED": {
      const url = typeof p.url === "string" ? p.url : null;
      return (
        <span className="inline-flex items-center gap-1.5">
          <GitPullRequest className="size-3.5 shrink-0 text-purple-500" />
          <span>PR opened</span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-blue-500 hover:underline"
            >
              {url.replace(/^https:\/\/github\.com\//, "")}
            </a>
          )}
        </span>
      );
    }
    case "PR_MERGED": {
      const url = typeof p.prUrl === "string" ? p.prUrl : null;
      const number = typeof p.prNumber === "number" ? p.prNumber : null;
      const title = typeof p.prTitle === "string" ? p.prTitle : null;
      const actor = typeof p.prActor === "string" ? p.prActor : null;
      const label = number !== null ? `PR #${number} merged` : "PR merged";
      return (
        <span className="inline-flex items-center gap-1.5">
          <GitMerge className="size-3.5 shrink-0 text-purple-500" />
          <span>{label}</span>
          {title && <span className="text-muted-foreground">— {title}</span>}
          {actor && <span className="text-muted-foreground">by {actor}</span>}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-blue-500 hover:underline"
            >
              {url.replace(/^https:\/\/github\.com\//, "")}
            </a>
          )}
        </span>
      );
    }
    case "COMMIT_PUSHED": {
      const branch = typeof p.branch === "string" ? p.branch : null;
      return (
        <span className="inline-flex items-center gap-1.5">
          <GitCommit className="size-3.5 shrink-0 text-emerald-500" />
          <span>Pushed{branch ? ` to ${branch}` : ""}</span>
        </span>
      );
    }
    case "TEST_RUN": {
      const passed = p.passed === true;
      return (
        <span className="inline-flex items-center gap-1.5">
          {passed ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="size-3.5 shrink-0 text-red-500" />
          )}
          <span>{passed ? "Tests passed" : "Tests failed"}</span>
        </span>
      );
    }
    case "BUILD": {
      const passed = p.passed === true;
      return (
        <span className="inline-flex items-center gap-1.5">
          <Hammer className="size-3.5 shrink-0 text-amber-500" />
          <span>{passed ? "Build succeeded" : "Build failed"}</span>
        </span>
      );
    }
    case "STATUS_CHANGED": {
      const fromLabel =
        (typeof p.fromName === "string" && p.fromName) ||
        (typeof p.fromKey === "string" && p.fromKey) ||
        "previous";
      const toLabel =
        (typeof p.toName === "string" && p.toName) ||
        (typeof p.toKey === "string" && p.toKey) ||
        "new";
      return (
        <span className="inline-flex items-center gap-1.5">
          <CircleDot className="size-3.5 shrink-0 text-blue-500" />
          <span>Status</span>
          <span className="font-medium">{fromLabel}</span>
          <ArrowRight className="size-3 shrink-0 opacity-60" />
          <span className="font-medium">{toLabel}</span>
        </span>
      );
    }
    case "STEP_STARTED": {
      const name = typeof p.name === "string" ? p.name : "step";
      return (
        <span className="inline-flex items-center gap-1.5">
          <CirclePlay className="size-3.5 shrink-0 text-blue-500" />
          <span>
            Step started: <span className="font-medium">{name}</span>
          </span>
        </span>
      );
    }
    case "STEP_COMPLETED": {
      const name = typeof p.name === "string" ? p.name : "step";
      const failed = p.result === "failure";
      const error = failed && typeof p.error === "string" ? p.error : null;
      return (
        <span className="inline-flex items-center gap-1.5">
          {failed ? (
            <XCircle className="size-3.5 shrink-0 text-red-500" />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
          )}
          <span>
            {failed ? "Step failed: " : "Step completed: "}
            <span className="font-medium">{name}</span>
          </span>
          {error && <span className="text-muted-foreground">— {error}</span>}
        </span>
      );
    }
    default:
      return (
        <span className="inline-flex items-center gap-1.5">
          <span>{typeof p.text === "string" ? p.text : "Update"}</span>
        </span>
      );
  }
}

export function TicketTimeline({
  ticketId,
  workspaceId,
  currentUserId,
  createdAt,
}: Props): React.ReactElement {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [serverActivities, setServerActivities] = useState<ServerActivity[]>([]);
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
    fetch(`/api/tickets/${ticketId}/activity`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (alive && b.ok) setServerActivities(b.data);
      })
      .catch(() => {});
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
              author: event.comment.author ?? null,
            },
          ];
        });
        return;
      }
      if (event.name === "comment.updated" && event.ticketId === ticketId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === event.comment.id
              ? { ...c, body: event.comment.body, author: event.comment.author ?? c.author }
              : c,
          ),
        );
        return;
      }
      if (event.name === "comment.deleted" && event.ticketId === ticketId) {
        setComments((prev) => prev.filter((c) => c.id !== event.commentId));
        return;
      }
      if (event.name === "ticket.activity" && event.ticketId === ticketId) {
        setServerActivities((prev) =>
          prev.some((a) => a.id === event.activity.id) ? prev : [event.activity, ...prev],
        );
      }
    },
    [ticketId],
  );

  useBoardChannel(workspaceId, handleEvent);

  const merged = useMemo<TimelineItem[]>(() => {
    const activity: ActivityItem[] = [
      { kind: "activity", id: "created", text: "You created the issue", createdAt },
    ];
    const fromServer: ActivityItem[] = serverActivities.map((a) => ({
      kind: "activity" as const,
      id: `srv:${a.id}`,
      createdAt: new Date(a.createdAt),
      data: a,
    }));
    return [...activity, ...fromServer, ...comments].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [comments, serverActivities, createdAt]);

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
                  <span className="text-foreground">
                    {item.data ? renderServerActivity(item.data) : item.text}
                  </span>
                  <span className="opacity-60">·</span>
                  <span>{formatDistanceToNowStrict(item.createdAt, { addSuffix: false })} ago</span>
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

      {loaded ? (
        <div className="space-y-2 pt-2">
          <ImageUploadTextarea
            workspaceId={workspaceId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            onUploadError={(message) => toast.error(`Image upload failed: ${message}`)}
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
      ) : null}
    </div>
  );
}

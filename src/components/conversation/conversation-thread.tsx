"use client";

import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  CirclePlay,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Hammer,
  Loader2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent, MessageEventPayload } from "@/lib/types";

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

type ServerTimelineRow =
  | {
      kind: "message";
      id: string;
      createdAt: string;
      messageId: string;
      message: MessageEventPayload;
    }
  | { kind: "activity"; id: string; createdAt: string; activityId: string };

type ClientMessage = MessageEventPayload & {
  // Streaming chunk buffer keyed by sequence; reassembled on render. Used
  // only while status === "STREAMING"; on COMPLETE the server publishes the
  // final body and we drop the buffer.
  streamingChunks?: Map<number, string>;
};

type Props = {
  ticketId: string;
  workspaceId: string;
  conversationId: string | null;
};

export function ConversationThread({
  ticketId,
  workspaceId,
  conversationId: _conversationId,
}: Props): React.ReactElement {
  const [messages, setMessages] = useState<Map<string, ClientMessage>>(new Map());
  const [order, setOrder] = useState<string[]>([]);
  const [activities, setActivities] = useState<ServerActivity[]>([]);
  const [composerBody, setComposerBody] = useState("");
  const [sending, setSending] = useState(false);
  const [composerMentions, setComposerMentions] = useState<
    { targetType: "USER" | "AGENT" | "TICKET"; targetId: string; label: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  // Sticky-bottom scroll: pin to the bottom when new messages land only if
  // the user is already at the bottom. If they've scrolled up to read, leave
  // their position alone and surface a "Jump to latest" affordance instead.
  //
  // The mechanics mirror the live ticket chat (ticket-agent-panel.tsx): a
  // synchronous scroll listener owns the live at-bottom truth, while the pin
  // effect re-reads the live scroll position so a streaming chunk that lands
  // in the same tick the user scrolls up can't yank them back.
  const scrollerRef = useRef<HTMLDivElement>(null);
  // 32px forgives a freshly-rendered row and sub-pixel scroll offsets while
  // staying tight enough that a deliberate scroll-up is detected immediately.
  const AT_BOTTOM_THRESHOLD = 32;
  const atBottomRef = useRef(true);
  // Programmatic scrolls fire a scroll event. Without this guard the listener
  // would briefly observe scrollTop > scrollHeight - clientHeight and flicker
  // atBottom to false for one frame.
  const isPinningRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const didInitialScrollRef = useRef(false);

  const upsertMessage = useCallback((m: MessageEventPayload) => {
    setMessages((prev) => {
      const next = new Map(prev);
      const existing = next.get(m.id);
      next.set(m.id, { ...m, streamingChunks: existing?.streamingChunks });
      return next;
    });
    setOrder((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
  }, []);

  // Initial load: timeline endpoint returns decorated message rows so the
  // rendered chat matches the server-selected message/activity window exactly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/v1/tickets/${ticketId}/timeline?limit=100`).catch(() => null);
      if (!r?.ok || cancelled) {
        setLoaded(true);
        return;
      }
      const json = (await r.json()) as { ok: boolean; data?: { items: ServerTimelineRow[] } };
      const items = json.ok && json.data ? json.data.items : [];
      const map = new Map<string, ClientMessage>();
      const ord: string[] = [];
      for (const row of items) {
        if (row.kind !== "message") continue;
        const message = row.message;
        map.set(message.id, {
          ...message,
          createdAt: new Date(message.createdAt),
          updatedAt: new Date(message.updatedAt),
        });
        ord.push(message.id);
      }
      if (!cancelled) {
        setMessages(map);
        setOrder(ord);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Activities — fetched from the existing endpoint and merged into the
  // timeline by createdAt at render time.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${ticketId}/activity`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled && b.ok) setActivities(b.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Realtime: workspace channel carries message.created/updated. We filter
  // to events for this ticket's conversation. Conversation may not exist yet
  // (lazy-created on first send) — gate on conversationId once it lands.
  const onEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name === "message.created" && event.ticketId === ticketId) {
        upsertMessage({
          ...event.message,
          createdAt: new Date(event.message.createdAt),
          updatedAt: new Date(event.message.updatedAt),
        });
      } else if (event.name === "ticket.activity" && event.ticketId === ticketId) {
        setActivities((prev) =>
          prev.some((a) => a.id === event.activity.id) ? prev : [event.activity, ...prev],
        );
      } else if (event.name === "message.updated" && event.ticketId === ticketId) {
        setMessages((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.messageId);
          if (!existing) return prev; // no base row — re-fetch on reconnect
          const updated: ClientMessage = { ...existing };
          if (event.status) updated.status = event.status;
          if (event.body !== undefined) {
            updated.body = event.body;
            updated.streamingChunks = undefined;
          }
          if (event.chunks) {
            const buf = new Map(updated.streamingChunks ?? []);
            for (const c of event.chunks) buf.set(c.sequence, c.delta);
            updated.streamingChunks = buf;
          }
          next.set(event.messageId, updated);
          return next;
        });
      }
    },
    [ticketId, upsertMessage],
  );
  useBoardChannel(workspaceId, onEvent);

  // Merged stream of messages + activities, sorted by createdAt. Activities
  // render as compact one-line pills between messages, matching the legacy
  // TicketTimeline panel's behavior.
  type Row =
    | { kind: "message"; createdAt: number; message: ClientMessage }
    | { kind: "activity"; createdAt: number; activity: ServerActivity };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const id of order) {
      const m = messages.get(id);
      if (!m) continue;
      // Legacy: pre-rewrite mirror wrote the entire WireEvent JSONL transcript
      // into a single SYSTEM message body. Those rows are still in the DB but
      // are now superseded by the per-turn USER/AGENT rows the new mirror
      // emits — so don't render them. Detected by a body that starts with a
      // WireEvent JSON envelope, OR an empty SYSTEM row left over from the
      // old "create paired message up front, append later" path that never
      // received any chunks.
      if (m.role === "SYSTEM" && m.agentJobId) {
        const body = typeof m.body === "string" ? m.body : "";
        if (body.length === 0) continue;
        if (/^\s*\{"kind":"(user|agent|stderr|exit)"/.test(body)) continue;
      }
      out.push({ kind: "message", createdAt: new Date(m.createdAt).getTime(), message: m });
    }
    for (const a of activities) {
      out.push({ kind: "activity", createdAt: new Date(a.createdAt).getTime(), activity: a });
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }, [order, messages, activities]);

  // Sync scroll listener: own the live at-bottom truth so the pin effect
  // below can read it synchronously without racing async observers.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = (): void => {
      if (isPinningRef.current) return;
      const next =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= AT_BOTTOM_THRESHOLD;
      if (atBottomRef.current !== next) {
        atBottomRef.current = next;
        setAtBottom(next);
      }
    };
    scroller.addEventListener("scroll", update, { passive: true });
    // Seed once on attach so the mirror reflects reality even if no scroll
    // event fires (content shorter than the viewport).
    update();
    return () => scroller.removeEventListener("scroll", update);
  }, [loaded]);

  // Pin on row changes, but only if the user is currently at the bottom.
  // First hydration (loaded → true with rows present) always pins so opening
  // the thread lands on the newest message. Subsequent pins read live
  // scrollTop synchronously to defeat the streaming-chunk-vs-scroll-up race.
  useEffect(() => {
    if (!loaded || rows.length === 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const pin = (): void => {
      isPinningRef.current = true;
      scroller.scrollTop = scroller.scrollHeight;
      atBottomRef.current = true;
      setAtBottom(true);
      // Release suppression on the next frame, after the browser emits the
      // scroll event for our programmatic write.
      requestAnimationFrame(() => {
        isPinningRef.current = false;
      });
    };
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      pin();
      return;
    }
    const nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= AT_BOTTOM_THRESHOLD;
    if (nearBottom) pin();
    else if (atBottomRef.current) {
      // Live position says we're scrolled away but the ref hasn't caught up
      // (e.g. a chunk landed before the scroll listener fired). Reconcile so
      // the Jump button surfaces immediately.
      atBottomRef.current = false;
      setAtBottom(false);
    }
  }, [rows, loaded]);

  const jumpToLatest = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    isPinningRef.current = true;
    scroller.scrollTop = scroller.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
    requestAnimationFrame(() => {
      isPinningRef.current = false;
    });
  }, []);

  const send = useCallback(async () => {
    const body = composerBody.trim();
    if (!body || sending) return;
    setSending(true);
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      await fetch(`/api/v1/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          idempotencyKey,
          mentions: composerMentions.map(({ targetType, targetId }) => ({
            targetType,
            targetId,
          })),
        }),
      });
      setComposerBody("");
      setComposerMentions([]);
    } finally {
      setSending(false);
    }
  }, [composerBody, composerMentions, sending, ticketId]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 min-h-0">
        <div ref={scrollerRef} className="absolute inset-0 space-y-4 overflow-y-auto px-1 py-2">
          {!loaded ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No activity yet.</div>
          ) : (
            rows.map((r) =>
              r.kind === "message" ? (
                <MessageRow key={r.message.id} message={r.message} />
              ) : (
                <ActivityRow key={r.activity.id} activity={r.activity} />
              ),
            )
          )}
        </div>
        {loaded && rows.length > 0 && !atBottom && (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label="Jump to most recent message"
            className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full border border-border bg-background/95 px-3 py-1 text-[11px] text-foreground shadow-md backdrop-blur transition-colors hover:bg-muted"
          >
            <ArrowDown className="size-3" aria-hidden />
            Jump to latest
          </button>
        )}
      </div>
      <div className="pt-3">
        {composerMentions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {composerMentions.map((m) => (
              <span
                key={`${m.targetType}:${m.targetId}`}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                <Bot className="size-3" />
                {m.label}
                <button
                  type="button"
                  onClick={() =>
                    setComposerMentions((prev) =>
                      prev.filter(
                        (x) => !(x.targetType === m.targetType && x.targetId === m.targetId),
                      ),
                    )
                  }
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove mention ${m.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative flex items-end gap-2">
          <textarea
            value={composerBody}
            onChange={(e) => setComposerBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message… (⌘↩)"
            className="min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
            disabled={sending}
          />
          <Button
            onClick={() => void send()}
            disabled={sending || !composerBody.trim()}
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ServerActivity }): React.ReactElement {
  const p = activity.payload;
  const time = formatDistanceToNowStrict(new Date(activity.createdAt), { addSuffix: true });
  const inner = (() => {
    switch (activity.kind) {
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
        return <span>{typeof p.text === "string" ? p.text : "Update"}</span>;
    }
  })();
  return (
    <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground/80">
      {inner}
      <span className="ml-auto tabular-nums">{time}</span>
    </div>
  );
}

function MessageRow({ message }: { message: ClientMessage }): React.ReactElement {
  const body = useMemo(() => {
    if (message.status !== "STREAMING" || !message.streamingChunks) return message.body;
    const chunks = message.streamingChunks;
    const sequences = [...chunks.keys()].sort((a, b) => a - b);
    return message.body + sequences.map((s) => chunks.get(s) ?? "").join("");
  }, [message.body, message.status, message.streamingChunks]);

  const authorLabel =
    message.role === "AGENT"
      ? (message.authorAgent?.name ?? "Agent")
      : message.role === "SYSTEM"
        ? "System"
        : (message.authorUser?.name ?? message.authorUser?.email ?? "User");

  const isStreaming = message.status === "STREAMING" || message.status === "PENDING";

  return (
    <div className="px-1">
      <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground/80">
        <span className="font-medium text-foreground/90">{authorLabel}</span>
        {isStreaming && (
          <span className="inline-flex items-center gap-1 text-[10px] text-cyan-500">
            <Loader2 className="size-2.5 animate-spin" />
            {message.status === "PENDING" ? "starting" : "running"}
          </span>
        )}
        {message.status === "ERROR" && <span className="text-[10px] text-red-500">error</span>}
        <span className="ml-auto tabular-nums" title={new Date(message.createdAt).toLocaleString()}>
          {formatDistanceToNowStrict(message.createdAt, { addSuffix: true })}
        </span>
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{body}</div>
    </div>
  );
}

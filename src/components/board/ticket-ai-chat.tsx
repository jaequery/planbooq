"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { listTicketAiMessages, runTicketAiCodeAgent, sendTicketAiMessage } from "@/actions/ai-chat";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { useBoardChannel } from "@/lib/realtime/use-board-channel";
import type { AblyChannelEvent } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: string;
  kind: string;
  body: string;
  authorId: string | null;
  createdAt: Date;
};

type Props = {
  ticketId: string;
  workspaceId: string;
};

function sortAsc(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function roleLabel(message: ChatMessage): string {
  if (message.role === "assistant") return "AI";
  if (message.role === "system") return "System";
  return "You";
}

export function TicketAiChat({ ticketId, workspaceId }: Props): React.ReactElement {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [isLoading, startLoad] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [isRunning, startRun] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const result = await listTicketAiMessages(ticketId);
      if (!result.ok) {
        toast.error(`Could not load AI thread: ${result.error}`);
        setLoaded(true);
        return;
      }
      setItems(sortAsc(result.data.items as ChatMessage[]));
      setLoaded(true);
    });
  }, [ticketId]);

  const handleEvent = useCallback(
    (event: AblyChannelEvent) => {
      if (event.name !== "ai.message.created") return;
      if (event.ticketId !== ticketId) return;
      setItems((prev) => {
        if (prev.some((m) => m.id === event.message.id)) return prev;
        const incoming: ChatMessage = {
          id: event.message.id,
          role: event.message.role,
          kind: event.message.kind,
          body: event.message.body,
          authorId: event.message.authorId,
          createdAt: new Date(event.message.createdAt),
        };
        return sortAsc([...prev, incoming]);
      });
    },
    [ticketId],
  );

  useBoardChannel(workspaceId, handleEvent);

  const submit = (): void => {
    const body = draft.trim();
    if (!body || isSubmitting) return;
    startSubmit(async () => {
      const result = await sendTicketAiMessage({ ticketId, body });
      if (!result.ok) {
        toast.error(`Could not send message: ${result.error}`);
        return;
      }
      setDraft("");
      const incoming: ChatMessage[] = [
        {
          id: result.data.user.id,
          role: result.data.user.role,
          kind: result.data.user.kind,
          body: result.data.user.body,
          authorId: result.data.user.authorId,
          createdAt: new Date(result.data.user.createdAt),
        },
      ];
      if (result.data.assistant) {
        incoming.push({
          id: result.data.assistant.id,
          role: result.data.assistant.role,
          kind: result.data.assistant.kind,
          body: result.data.assistant.body,
          authorId: result.data.assistant.authorId,
          createdAt: new Date(result.data.assistant.createdAt),
        });
      }
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const next = [...prev];
        for (const m of incoming) {
          if (!seen.has(m.id)) next.push(m);
        }
        return sortAsc(next);
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

  return (
    <div className="space-y-3">
      {!loaded && isLoading ? (
        <div className="text-[12px] text-muted-foreground">Loading AI thread…</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-[12px] text-muted-foreground">
          Ask the AI for a plan, a diff, or a commit. Press{" "}
          <kbd className="rounded bg-muted px-1">⌘</kbd>+
          <kbd className="rounded bg-muted px-1">Enter</kbd> to send.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((message) => {
            const isAssistant = message.role === "assistant";
            const isSystem = message.role === "system";
            return (
              <li key={message.id} className="flex gap-2">
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
                    <div
                      aria-hidden
                      className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/30"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="text-foreground">{roleLabel(message)}</span>
                    <span className="opacity-60">·</span>
                    <span>
                      {formatDistanceToNowStrict(message.createdAt, { addSuffix: false })} ago
                    </span>
                  </div>
                  <Markdown className="text-[13px] text-foreground">{message.body}</Markdown>
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
          placeholder="Ask the AI…"
          rows={3}
          maxLength={10_000}
          aria-label="New AI message"
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
            {isSubmitting ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

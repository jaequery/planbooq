"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { quickCreateTicket } from "@/actions/ticket";
import type { Ticket } from "@/lib/types";

type Props = {
  projectId: string;
  projectName: string;
  totalTickets: number;
  runningTickets: number;
  onCreated: (ticket: Ticket) => void;
};

function describeError(error: string): string {
  if (error === "no_key") {
    return "OpenRouter API key not configured. Add one in Settings → OpenRouter.";
  }
  if (error === "no_backlog_status") return "This workspace has no Backlog column.";
  if (error === "duplicate_title") return "A ticket with this title already exists.";
  if (error === "openrouter_timeout") return "Drafting timed out. Try again.";
  if (error.startsWith("openrouter_")) return `LLM request failed (${error}).`;
  return `Could not create ticket: ${error}`;
}

export function ChatOrb({
  projectId,
  projectName,
  totalTickets,
  runningTickets,
  onCreated,
}: Props): React.ReactElement {
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const submit = (): void => {
    const trimmed = prompt.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const result = await quickCreateTicket({ projectId, prompt: trimmed });
      if (!result.ok) {
        toast.error(describeError(result.error));
        return;
      }
      onCreated(result.data);
      toast.success("Ticket created in Backlog");
      setPrompt("");
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto relative w-full max-w-[520px]">
        <div
          aria-hidden
          className="-inset-px absolute rounded-2xl opacity-60 blur-xl"
          style={{
            background:
              "linear-gradient(120deg, rgba(245,158,11,0.5), rgba(16,185,129,0.4), rgba(99,102,241,0.4))",
            zIndex: -1,
          }}
        />
        <div className="rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.10)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div
              className="h-6 w-6 flex-shrink-0 rounded-full"
              style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
              aria-hidden
            />
            <input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                pending ? "Drafting…" : "What should we ship next? (Enter to create)"
              }
              disabled={pending}
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘N
            </kbd>
          </div>
          <div className="mt-1.5 flex gap-2 pl-9 text-[10px] text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">Context:</span> {projectName}
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-foreground">{totalTickets}</span> ticket
              {totalTickets === 1 ? "" : "s"}
            </span>
            {runningTickets > 0 ? (
              <>
                <span>·</span>
                <span>{runningTickets} running</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

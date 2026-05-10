"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { quickCreateTicket } from "@/actions/ticket";
import type { Ticket, TicketWithRelations } from "@/lib/types";

type Props = {
  projectId: string;
  workspaceId: string;
  backlogStatusId: string | null;
  currentUserId: string;
  onOptimisticInsert: (ticket: TicketWithRelations) => void;
  onOptimisticReplace: (tempId: string, real: Ticket) => void;
  onOptimisticRollback: (tempId: string) => void;
};

function makeTempId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp_${crypto.randomUUID()}`;
  }
  return `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

const AUTO_PLAN_STORAGE_KEY = "pbq.autoPlan";

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
  workspaceId,
  backlogStatusId,
  currentUserId,
  onOptimisticInsert,
  onOptimisticReplace,
  onOptimisticRollback,
}: Props): React.ReactElement {
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [autoPlan, setAutoPlan] = useState(true);
  const isActive = isFocused || prompt.length > 0 || pending;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AUTO_PLAN_STORAGE_KEY);
      if (stored === "false") setAutoPlan(false);
    } catch {
      // ignore
    }
  }, []);

  const toggleAutoPlan = (): void => {
    setAutoPlan((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUTO_PLAN_STORAGE_KEY, next ? "true" : "false");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const submit = (): void => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (pending) return;

    const tempId = makeTempId();
    const previewTitle = trimmed.slice(0, 120);
    const now = new Date();
    const optimisticTicket: TicketWithRelations | null = backlogStatusId
      ? {
          id: tempId,
          workspaceId,
          projectId,
          statusId: backlogStatusId,
          title: previewTitle,
          description: null,
          plan: null,
          priority: "NO_PRIORITY",
          assigneeId: null,
          dueDate: null,
          position: Number.MAX_SAFE_INTEGER,
          prUrl: null,
          createdById: currentUserId,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          assignee: null,
          labels: [],
        }
      : null;

    if (optimisticTicket) onOptimisticInsert(optimisticTicket);

    setPrompt("");
    const submittedAutoPlan = autoPlan;

    startTransition(async () => {
      const result = await quickCreateTicket({
        projectId,
        prompt: trimmed,
        autoPlan: submittedAutoPlan,
      });
      if (!result.ok) {
        if (optimisticTicket) onOptimisticRollback(tempId);
        toast.error(describeError(result.error));
        return;
      }
      if (optimisticTicket) {
        onOptimisticReplace(tempId, result.data);
      } else {
        onOptimisticInsert({ ...result.data, assignee: null, labels: [] });
      }
      toast.success(submittedAutoPlan ? "Ticket created in Todo" : "Ticket created in Backlog");
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto relative w-full max-w-[520px]">
        <div
          aria-hidden
          className={`-inset-1 absolute rounded-2xl chat-orb-glow ${
            isActive ? "chat-orb-glow-active" : ""
          }`}
          style={{ zIndex: -1 }}
        />
        <div
          className={`rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.10)] backdrop-blur transition-shadow duration-300 ${
            isActive ? "chat-orb-shell-active" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className="h-6 w-6 flex-shrink-0 rounded-full"
              style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
              aria-hidden
            />
            <textarea
              ref={inputRef}
              rows={1}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={pending ? "Drafting…" : "What should we ship next? (Enter to create)"}
              disabled={pending}
              className="field-sizing-content max-h-60 min-h-6 flex-1 resize-none bg-transparent text-[13px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
          </div>
          <div className="mt-2 flex items-center justify-center">
            <button
              type="button"
              role="switch"
              aria-checked={autoPlan}
              onClick={toggleAutoPlan}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              title={autoPlan ? "Auto-plan: on" : "Auto-plan: off"}
            >
              <span
                className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                  autoPlan ? "bg-primary" : "bg-muted"
                }`}
                aria-hidden
              >
                <span
                  className={`inline-block h-2.5 w-2.5 transform rounded-full bg-background shadow transition-transform ${
                    autoPlan ? "translate-x-3" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span>Auto-plan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Maximize2, MessageSquare, Minimize2, Minus, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOptionalAiPanel } from "./ai-panel-provider";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

export function AiPanel() {
  const ctx = useOptionalAiPanel();

  // Reflect height into CSS var even when hidden (handled in provider).
  // ESC closes when focus is inside.
  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const root = document.getElementById("ai-panel-root");
      if (root && target && root.contains(target)) {
        ctx.setState("minimized");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);

  if (!ctx) return null;
  if (!ctx.ready) return null;

  const { state } = ctx;

  if (state === "hidden") {
    return (
      <button
        type="button"
        onClick={ctx.open}
        aria-label="Open Planbooq AI"
        className="fixed right-4 bottom-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:bg-primary/90"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <MessageSquare className="size-5" />
      </button>
    );
  }

  const heightClass =
    state === "minimized" ? "h-12" : state === "expanded" ? "h-[40vh]" : "h-[80vh]";

  const lastAssistant = [...ctx.messages].reverse().find((m) => m.role === "assistant");
  const minimizedSnippet = ctx.streaming
    ? ctx.draftAssistant || "thinking…"
    : (lastAssistant?.body ?? "Ask Planbooq AI…");

  const ctxBadge = ctx.pageContext.ticketId
    ? `ticket: ${ctx.pageContext.ticketId.slice(0, 8)}`
    : ctx.pageContext.projectId
      ? "project context"
      : "workspace";

  return (
    <aside
      id="ai-panel-root"
      className={cn(
        "fixed right-0 bottom-0 left-0 z-50 flex flex-col border-t border-border bg-background shadow-lg",
        "rounded-t-2xl transition-[height] duration-200 ease-out",
        heightClass,
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Planbooq AI panel"
    >
      {state === "minimized" ? (
        <div className="flex h-12 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => ctx.setState("expanded")}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Expand Planbooq AI"
          >
            <MessageSquare className="size-4 shrink-0" />
            <span className="truncate">{minimizedSnippet}</span>
          </button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => ctx.setState("expanded")}
            aria-label="Expand"
          >
            <Maximize2 />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={ctx.close} aria-label="Close">
            <X />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Planbooq AI</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {ctxBadge}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => ctx.setState("minimized")}
                aria-label="Minimize"
              >
                <Minus />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => ctx.setState(state === "maximized" ? "expanded" : "maximized")}
                aria-label={state === "maximized" ? "Restore" : "Maximize"}
              >
                {state === "maximized" ? <Minimize2 /> : <Maximize2 />}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={ctx.close} aria-label="Close">
                <X />
              </Button>
            </div>
          </div>

          <MessageList
            messages={ctx.messages}
            draftAssistant={ctx.draftAssistant}
            streaming={ctx.streaming}
            defaultProjectId={ctx.pageContext.projectId}
            onConfirmTool={ctx.confirmTool}
            onRejectTool={ctx.rejectTool}
          />

          <div className="shrink-0 border-t border-border bg-background px-3 py-2">
            <Composer onSend={ctx.sendMessage} disabled={ctx.streaming} />
          </div>
        </>
      )}
    </aside>
  );
}

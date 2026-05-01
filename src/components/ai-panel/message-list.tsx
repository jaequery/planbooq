"use client";

import type { AiPanelMessage } from "@prisma/client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ToolConfirmCard } from "./tool-confirm-card";

type Props = {
  messages: AiPanelMessage[];
  draftAssistant: string;
  streaming: boolean;
  defaultProjectId?: string | null;
  onConfirmTool: (messageId: string, args: Record<string, unknown>) => void;
  onRejectTool: (messageId: string) => void;
};

export function MessageList({
  messages,
  draftAssistant,
  streaming,
  defaultProjectId,
  onConfirmTool,
  onRejectTool,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, draftAssistant]);

  return (
    <div
      ref={ref}
      className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      onScroll={(e) => {
        const el = e.currentTarget;
        const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
        stickRef.current = distance < 32;
      }}
    >
      {messages.length === 0 && !draftAssistant ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Ask anything about your workspace, or describe a ticket / project to create.
        </div>
      ) : null}
      {messages.map((m) => {
        if (m.role === "tool") {
          return (
            <ToolConfirmCard
              key={m.id}
              message={m}
              defaultProjectId={defaultProjectId}
              onConfirm={onConfirmTool}
              onReject={onRejectTool}
            />
          );
        }
        const isUser = m.role === "user";
        return (
          <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {m.body}
            </div>
          </div>
        );
      })}
      {streaming && draftAssistant ? (
        <div className="flex justify-start">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
            {draftAssistant}
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-muted-foreground align-middle" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

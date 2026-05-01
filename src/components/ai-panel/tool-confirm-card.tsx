"use client";

import type { AiPanelMessage } from "@prisma/client";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  message: AiPanelMessage;
  defaultProjectId?: string | null;
  onConfirm: (messageId: string, args: Record<string, unknown>) => void;
  onReject: (messageId: string) => void;
};

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function ToolConfirmCard({ message, defaultProjectId, onConfirm, onReject }: Props) {
  const initialArgs = asObj(message.toolArgs);
  const isTicket = message.toolName === "create_ticket";

  const [title, setTitle] = useState<string>(String(initialArgs.title ?? ""));
  const [description, setDescription] = useState<string>(String(initialArgs.description ?? ""));
  const [name, setName] = useState<string>(String(initialArgs.name ?? ""));
  const [color, setColor] = useState<string>(String(initialArgs.color ?? ""));
  const [projectIdField, setProjectIdField] = useState<string>(
    String(initialArgs.projectId ?? defaultProjectId ?? ""),
  );

  const status = message.toolStatus;

  if (status === "executed" || status === "confirmed") {
    const result = asObj(message.toolResult);
    const url = typeof result.url === "string" ? result.url : null;
    const kind = typeof result.kind === "string" ? result.kind : isTicket ? "ticket" : "project";
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Created {kind}</span>{" "}
        {url ? (
          <a href={url} className="font-medium text-primary underline-offset-2 hover:underline">
            open
          </a>
        ) : null}
      </div>
    );
  }

  if (status === "rejected" || status === "failed") {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {status === "rejected" ? "Rejected" : "Failed"}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {isTicket ? "Create ticket" : "Create project"}
      </div>
      <div className="space-y-2">
        {isTicket ? (
          <>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ticket title"
              aria-label="Ticket title"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="min-h-[60px]"
              aria-label="Ticket description"
            />
            <div className="flex items-center gap-2">
              <Input
                value={projectIdField}
                onChange={(e) => setProjectIdField(e.target.value)}
                placeholder="Project ID"
                aria-label="Project ID"
                className="font-mono text-xs"
              />
              {!initialArgs.projectId && defaultProjectId ? (
                <span className="whitespace-nowrap text-xs text-muted-foreground">from page</span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              aria-label="Project name"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="min-h-[60px]"
              aria-label="Project description"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Color (e.g. #6366f1)"
              aria-label="Color"
            />
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onReject(message.id)}>
          <X /> Reject
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const args: Record<string, unknown> = isTicket
              ? {
                  title,
                  description: description || undefined,
                  projectId: projectIdField || undefined,
                }
              : { name, description: description || undefined, color: color || undefined };
            onConfirm(message.id, args);
          }}
        >
          <Check /> Confirm
        </Button>
      </div>
    </div>
  );
}

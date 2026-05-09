"use client";

import { ImageIcon, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { quickCreateTicket } from "@/actions/ticket";
import type { Ticket } from "@/lib/types";

type Props = {
  projectId: string;
  workspaceId: string;
  onCreated: (ticket: Ticket) => void;
};

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp,image/gif";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

type Attachment = {
  uploadId: number;
  name: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  remoteUrl?: string;
};

type UploadResponse =
  | { ok: true; data: { id: string; url: string } }
  | { ok: false; error: string };

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

function imageMarkdown(name: string, url: string): string {
  const alt = name.replace(/[[\]]/g, "").trim() || "image";
  return `![${alt}](${url})`;
}

export function ChatOrb({
  projectId,
  workspaceId,
  onCreated,
}: Props): React.ReactElement {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || isDragging || prompt.length > 0 || pending;

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

  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAttachment = (uploadId: number, patch: Partial<Attachment>): void => {
    setAttachments((prev) =>
      prev.map((a) => (a.uploadId === uploadId ? { ...a, ...patch } : a)),
    );
  };

  const removeAttachment = (uploadId: number): void => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.uploadId === uploadId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.uploadId !== uploadId);
    });
  };

  const uploadFile = async (file: File): Promise<void> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error("Image is larger than 5 MB.");
      return;
    }

    uploadCounterRef.current += 1;
    const uploadId = uploadCounterRef.current;
    const previewUrl = URL.createObjectURL(file);
    setAttachments((prev) => [
      ...prev,
      { uploadId, name: file.name, previewUrl, status: "uploading" },
    ]);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceId", workspaceId);
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as UploadResponse | null;
      if (!res.ok || !json || !json.ok) {
        const error = json && !json.ok ? json.error : `upload_failed_${res.status}`;
        toast.error(`Upload failed: ${error}`);
        updateAttachment(uploadId, { status: "error" });
        return;
      }
      updateAttachment(uploadId, { status: "ready", remoteUrl: json.data.url });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      updateAttachment(uploadId, { status: "error" });
    }
  };

  const handleFiles = (files: FileList | File[]): void => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const f of arr) void uploadFile(f);
  };

  const onFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  };

  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    const files: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i += 1) {
      const item = e.clipboardData.items[i];
      if (item && item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    }
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const onDragLeave: React.DragEventHandler<HTMLDivElement> = () => {
    setIsDragging(false);
  };

  const submit = (): void => {
    const trimmed = prompt.trim();
    const ready = attachments.filter((a) => a.status === "ready" && a.remoteUrl);
    const uploading = attachments.some((a) => a.status === "uploading");
    if (uploading) {
      toast.error("Wait for image upload to finish.");
      return;
    }
    if (!trimmed && ready.length === 0) return;
    if (pending) return;

    const imageMd = ready.map((a) => imageMarkdown(a.name, a.remoteUrl as string)).join("\n");
    const composedPrompt = [trimmed, imageMd].filter(Boolean).join("\n\n");

    startTransition(async () => {
      const result = await quickCreateTicket({ projectId, prompt: composedPrompt });
      if (!result.ok) {
        toast.error(describeError(result.error));
        return;
      }
      onCreated(result.data);
      toast.success("Ticket created in Backlog");
      setPrompt("");
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
      setAttachments([]);
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
          className={`rounded-2xl border bg-background/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.10)] backdrop-blur transition-shadow duration-300 ${
            isDragging ? "border-ring ring-2 ring-ring/60" : "border-border/70"
          } ${isActive ? "chat-orb-shell-active" : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2 pl-9">
              {attachments.map((a) => (
                <div
                  key={a.uploadId}
                  className="group relative h-14 w-14 overflow-hidden rounded-md border border-border bg-muted"
                  title={a.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.previewUrl}
                    alt={a.name}
                    className="h-full w-full object-cover"
                  />
                  {a.status === "uploading" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                    </div>
                  ) : null}
                  {a.status === "error" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/70 text-[9px] text-destructive-foreground">
                      failed
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.uploadId)}
                    className="absolute top-0.5 right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

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
              onPaste={onPaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                pending ? "Drafting…" : "What should we ship next? (Enter to create)"
              }
              disabled={pending}
              className="field-sizing-content max-h-60 min-h-6 flex-1 resize-none bg-transparent text-[13px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME_TYPES}
              multiple
              className="hidden"
              onChange={onFileInputChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Attach image"
              title="Attach image"
            >
              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            </button>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘N
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

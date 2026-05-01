"use client";

import { ImageIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp,image/gif";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

type ImageUploadTextareaProps = React.ComponentProps<typeof Textarea> & {
  workspaceId: string;
  onUploadError?: (message: string) => void;
};

type UploadResponse =
  | { ok: true; data: { id: string; url: string } }
  | { ok: false; error: string };

function placeholderToken(uploadId: number): string {
  return `![uploading-${uploadId}…]()`;
}

function imageMarkdown(name: string, url: string): string {
  const alt = name.replace(/[[\]]/g, "").trim() || "image";
  return `![${alt}](${url})`;
}

function ImageUploadTextarea({
  workspaceId,
  onUploadError,
  onPaste,
  onDrop,
  onDragOver,
  onDragLeave,
  className,
  value,
  onChange,
  ...props
}: ImageUploadTextareaProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputId = useId();

  const canUpload = workspaceId.length > 0;

  const dispatchValue = (next: string): void => {
    const target = textareaRef.current;
    if (!target) return;
    target.value = next;
    onChange?.({
      target,
      currentTarget: target,
      nativeEvent: new Event("input"),
      bubbles: true,
      cancelable: false,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: false,
      preventDefault: () => {},
      isDefaultPrevented: () => false,
      stopPropagation: () => {},
      isPropagationStopped: () => false,
      persist: () => {},
      timeStamp: Date.now(),
      type: "change",
    } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
  };

  const insertAtCursor = (insertion: string): void => {
    const el = textareaRef.current;
    const current = typeof value === "string" ? value : (el?.value ?? "");
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + insertion + current.slice(end);
    dispatchValue(next);
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      const caret = start + insertion.length;
      t.selectionStart = caret;
      t.selectionEnd = caret;
    });
  };

  const replaceToken = (token: string, replacement: string): void => {
    const current = textareaRef.current?.value ?? "";
    if (!current.includes(token)) return;
    dispatchValue(current.replace(token, replacement));
  };

  const removeToken = (token: string): void => {
    const current = textareaRef.current?.value ?? "";
    if (!current.includes(token)) return;
    dispatchValue(current.replace(token, ""));
  };

  const reportError = (message: string): void => {
    if (onUploadError) onUploadError(message);
    else console.error("image-upload-textarea:", message);
  };

  const uploadFile = async (file: File): Promise<void> => {
    if (!canUpload) return;
    if (!file.type.startsWith("image/")) {
      reportError("Only image files are supported.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      reportError("Image is larger than 5 MB.");
      return;
    }

    uploadCounterRef.current += 1;
    const uploadId = uploadCounterRef.current;
    const token = placeholderToken(uploadId);
    insertAtCursor(token);
    setIsUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceId", workspaceId);
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as UploadResponse | null;
      if (!res.ok || !json || !json.ok) {
        const error = json && !json.ok ? json.error : `upload_failed_${res.status}`;
        removeToken(token);
        reportError(error);
        return;
      }
      replaceToken(token, imageMarkdown(file.name, json.data.url));
    } catch (error) {
      removeToken(token);
      reportError(error instanceof Error ? error.message : "upload_failed");
    } finally {
      setIsUploading(false);
    }
  };

  const filesFromDataTransfer = (items: DataTransferItemList | null): File[] => {
    const files: File[] = [];
    if (!items) return files;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item && item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    return files;
  };

  const handlePaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    onPaste?.(e);
    if (e.defaultPrevented || !canUpload) return;
    const images = filesFromDataTransfer(e.clipboardData.items);
    if (images.length === 0) return;
    e.preventDefault();
    for (const file of images) void uploadFile(file);
  };

  const handleDrop: React.DragEventHandler<HTMLTextAreaElement> = (e) => {
    onDrop?.(e);
    setIsDragging(false);
    if (e.defaultPrevented || !canUpload) return;
    const images = filesFromDataTransfer(e.dataTransfer.items);
    if (images.length === 0) return;
    e.preventDefault();
    for (const file of images) void uploadFile(file);
  };

  const handleDragOver: React.DragEventHandler<HTMLTextAreaElement> = (e) => {
    onDragOver?.(e);
    if (!canUpload) return;
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave: React.DragEventHandler<HTMLTextAreaElement> = (e) => {
    onDragLeave?.(e);
    setIsDragging(false);
  };

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const list = e.target.files;
    if (!list) return;
    for (let i = 0; i < list.length; i += 1) {
      const f = list.item(i);
      if (f) void uploadFile(f);
    }
    e.target.value = "";
  };

  return (
    <div className="relative" data-dragging={isDragging ? "true" : undefined}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(isDragging && "ring-2 ring-ring/60", className)}
        {...props}
      />
      {canUpload ? (
        <>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept={ACCEPTED_MIME_TYPES}
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute right-1.5 bottom-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={isUploading}
            aria-label="Upload image"
            title="Upload image"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}

export type { ImageUploadTextareaProps };
export { ImageUploadTextarea };

"use client";

import { Check, ChevronDown, HelpCircle, ImageIcon, Loader2, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { quickCreateTicket } from "@/actions/ticket";
import { listWorkflowTemplates } from "@/actions/workflow";
import { WorkflowManagerDialog } from "@/components/board/workflow-manager-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Ticket, TicketWithRelations } from "@/lib/types";

type Props = {
  projectId: string;
  workspaceId: string;
  backlogStatusId: string | null;
  currentUserId: string;
  defaultWorkflowTemplateId: string | null;
  onOptimisticInsert: (ticket: TicketWithRelations) => void;
  onOptimisticReplace: (tempId: string, real: Ticket) => void;
  onOptimisticRollback: (tempId: string) => void;
};

type WorkflowTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
};

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp,image/gif";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\([^)]*\)/g;

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

function imageMarkdown(name: string, url: string): string {
  const alt = name.replace(/[[\]]/g, "").trim() || "image";
  return `![${alt}](${url})`;
}

function makeTempId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp_${crypto.randomUUID()}`;
  }
  return `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

const AUTO_EXECUTE_STORAGE_KEY = "pbq.autoExecute";
const AUTO_RUN_ID_STORAGE_KEY = "pbq.autoRunWorkflowId";
// Legacy multi-select key — read-only, used once for migration.
const LEGACY_AUTO_RUN_IDS_STORAGE_KEY = "pbq.autoRunWorkflowIds";

// Tri-state migration of the legacy global auto-run flag:
//   - "true" / null  → default-on (caller seeds with the project default id)
//   - "false"        → default-off (caller seeds with null)
function readLegacyAutoExecute(): boolean {
  try {
    return window.localStorage.getItem(AUTO_EXECUTE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

// Reads the persisted single-id selection. For backwards-compat with the
// previous multi-select schema, we also accept a JSON array and collapse it
// to its first valid id so existing users don't get reset to "off" silently.
function readAutoRunId(): string | null {
  try {
    const raw = window.localStorage.getItem(AUTO_RUN_ID_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "string" && parsed.length > 0) return parsed;
      } catch {
        // fall through to legacy lookup
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_AUTO_RUN_IDS_STORAGE_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy);
    if (!Array.isArray(parsed)) return null;
    const first = parsed.find((x): x is string => typeof x === "string" && x.length > 0);
    return first ?? null;
  } catch {
    return null;
  }
}

function writeAutoRunId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(AUTO_RUN_ID_STORAGE_KEY);
    else window.localStorage.setItem(AUTO_RUN_ID_STORAGE_KEY, JSON.stringify(id));
    // Clear the legacy multi-select array so it can't reappear after a refresh.
    window.localStorage.removeItem(LEGACY_AUTO_RUN_IDS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

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
  defaultWorkflowTemplateId,
  onOptimisticInsert,
  onOptimisticReplace,
  onOptimisticRollback,
}: Props): React.ReactElement {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplateRow[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  // Tracks whether we've reconciled the auto-run selection with the
  // server-side templates list at least once. Until then we keep whatever
  // localStorage held (or null), but never persist back.
  const seededRef = useRef(false);
  const isActive = isFocused || prompt.length > 0 || pending || attachments.length > 0;

  // Effective auto-run for THIS project: only fires when the user's selected
  // workflow IS the project's default. Per-ticket workflow overrides aren't
  // exposed at create-time, so the project default is the honest decision
  // point.
  const effectiveAutoExecute =
    selectedWorkflowId !== null && selectedWorkflowId === defaultWorkflowTemplateId;

  // Label rendered on the auto-run pill: the selected workflow's name when we
  // can resolve one, otherwise the generic "Auto-run" so the disabled / not-yet-
  // loaded state still reads as itself.
  const displayLabel = useMemo(() => {
    if (selectedWorkflowId && templates) {
      const match = templates.find((t) => t.id === selectedWorkflowId);
      if (match) return match.name;
    }
    return "Auto-run";
  }, [selectedWorkflowId, templates]);

  // Load the persisted selection on mount.
  useEffect(() => {
    const stored = readAutoRunId();
    if (stored) setSelectedWorkflowId(stored);
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await listWorkflowTemplates({ workspaceId });
      if (!res.ok) {
        toast.error(`Could not load workflows: ${res.error}`);
        return;
      }
      setTemplates(res.templates);
      // First-ever load: migrate the legacy global flag (and any legacy
      // multi-select array) into a single selection so existing users keep
      // their effective on/off behavior.
      if (!seededRef.current) {
        seededRef.current = true;
        const existing = readAutoRunId();
        if (existing === null) {
          const seed = readLegacyAutoExecute()
            ? (res.templates.find((t) => t.id === defaultWorkflowTemplateId)?.id ??
              res.templates[0]?.id ??
              null)
            : null;
          setSelectedWorkflowId(seed);
          writeAutoRunId(seed);
        } else if (!res.templates.some((t) => t.id === existing)) {
          // Stored selection points at a deleted template — clear it.
          setSelectedWorkflowId(null);
          writeAutoRunId(null);
        }
      }
    } finally {
      setTemplatesLoading(false);
    }
  }, [workspaceId, defaultWorkflowTemplateId]);

  // Eagerly load templates once on mount so the legacy-flag migration runs
  // before the user's first ticket submit (otherwise the very first create
  // after upgrade would see an empty allowlist and silently lose auto-run).
  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // Single-selection radio behavior: clicking the selected row clears it,
  // clicking any other row replaces the selection.
  const toggleWorkflowAutoRun = useCallback((id: string): void => {
    setSelectedWorkflowId((prev) => {
      const next = prev === id ? null : id;
      writeAutoRunId(next);
      return next;
    });
  }, []);

  useEffect(() => {
    function handle(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "n") return;
      const input = inputRef.current;
      if (!input || input.disabled) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAttachment = (uploadId: number, patch: Partial<Attachment>): void => {
    setAttachments((prev) => prev.map((a) => (a.uploadId === uploadId ? { ...a, ...patch } : a)));
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
      if (!res.ok || !json?.ok) {
        const error = json?.ok === false ? json.error : `upload_failed_${res.status}`;
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
      if (item?.kind === "file") {
        const f = item.getAsFile();
        if (f?.type.startsWith("image/")) files.push(f);
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

    const tempId = makeTempId();
    const titleSource =
      trimmed.replace(IMAGE_MARKDOWN_RE, "").trim() ||
      (ready.length > 0 ? `Image: ${ready[0]?.name ?? "attachment"}` : "");
    const previewTitle = titleSource.slice(0, 120);
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
    const snapshotAttachments = attachments;
    setAttachments([]);
    const submittedAutoExecute = effectiveAutoExecute;

    startTransition(async () => {
      const result = await quickCreateTicket({
        projectId,
        prompt: composedPrompt,
        autoExecute: submittedAutoExecute,
      });
      if (!result.ok) {
        if (optimisticTicket) onOptimisticRollback(tempId);
        toast.error(describeError(result.error));
        return;
      }
      for (const a of snapshotAttachments) URL.revokeObjectURL(a.previewUrl);
      if (optimisticTicket) {
        onOptimisticReplace(tempId, result.data);
      } else {
        onOptimisticInsert({ ...result.data, assignee: null, labels: [] });
      }
      // Auto-run is dispatched server-side via Ably (ticket.workflow.run on
      // workspace channel). The board's realtime handler opens the ticket
      // dialog with autoRunOnOpen, and the workflow panel kicks runAll() once
      // its data is loaded.
      toast.success(
        submittedAutoExecute ? "Ticket created and running" : "Ticket created in Backlog",
      );
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
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target wrapping a textarea */}
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
                  <img src={a.previewUrl} alt={a.name} className="h-full w-full object-cover" />
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
              placeholder={pending ? "Drafting…" : "What should we ship next? (Enter to create)"}
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
              className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center self-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Attach image"
              title="Attach image"
            >
              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            </button>
            <div className="inline-flex flex-shrink-0 items-center self-center rounded-full text-muted-foreground">
              <button
                type="button"
                role="switch"
                aria-checked={effectiveAutoExecute}
                disabled={pending || defaultWorkflowTemplateId === null}
                onClick={() => {
                  if (defaultWorkflowTemplateId === null) return;
                  toggleWorkflowAutoRun(defaultWorkflowTemplateId);
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[11px] transition-colors hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground"
                title={
                  defaultWorkflowTemplateId === null
                    ? "Set a default workflow in project settings to enable auto-run"
                    : effectiveAutoExecute
                      ? "Auto-run: on — click to disable"
                      : "Auto-run: off — click to enable"
                }
              >
                <span
                  className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                    effectiveAutoExecute ? "bg-primary" : "bg-muted"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 transform rounded-full bg-background shadow transition-transform ${
                      effectiveAutoExecute ? "translate-x-3" : "translate-x-0.5"
                    }`}
                  />
                </span>
                <span className="max-w-[8rem] truncate">{displayLabel}</span>
              </button>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What is auto-run?"
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    >
                      <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6} className="max-w-[15rem] text-center">
                    Auto-run dispatches the selected workflow as soon as a ticket is created. Toggle
                    off to keep workflows manual.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={pickerOpen}
                    aria-label="Choose auto-run workflow"
                    disabled={pending}
                    className="inline-flex h-5 w-4 items-center justify-center rounded transition-colors hover:text-foreground disabled:opacity-50"
                    title="Choose which workflow auto-runs"
                  >
                    <ChevronDown className="h-3 w-3" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} className="w-72 p-0">
                  <div className="border-b border-border/70 px-3 py-2">
                    <div className="font-medium text-[12px]">Auto-run workflow</div>
                    <p className="text-[11px] text-muted-foreground">
                      Pick the one workflow that auto-runs on new tickets. Only fires when it
                      matches the project default.
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1" role="radiogroup">
                    {templatesLoading && templates === null ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        Loading workflows…
                      </div>
                    ) : templates && templates.length > 0 ? (
                      templates.map((t) => {
                        const selected = selectedWorkflowId === t.id;
                        const isDefault = t.id === defaultWorkflowTemplateId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            onClick={() => toggleWorkflowAutoRun(t.id)}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                          >
                            <span
                              className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background"
                              }`}
                              aria-hidden
                            >
                              {selected ? <Check className="h-3 w-3" aria-hidden /> : null}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{t.name}</span>
                                {isDefault ? (
                                  <span className="rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                                    default
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {t.stepCount} {t.stepCount === 1 ? "step" : "steps"}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-3 text-[12px] text-muted-foreground">
                        No workflows yet.{" "}
                        <a
                          href="/settings/workflows"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          Create one
                        </a>{" "}
                        in Settings.
                      </div>
                    )}
                  </div>
                  {templates && templates.length > 0 && defaultWorkflowTemplateId === null ? (
                    <div className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                      This project has no default workflow, so auto-run can't fire. Set one in
                      project settings.
                    </div>
                  ) : null}
                  <div className="border-t border-border/70 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        setManagerOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:bg-muted/60 focus:text-foreground focus:outline-none"
                    >
                      <Settings2 className="h-3 w-3" aria-hidden />
                      Manage workflows
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <WorkflowManagerDialog
          open={managerOpen}
          onOpenChange={setManagerOpen}
          workspaceId={workspaceId}
          defaultWorkflowTemplateId={defaultWorkflowTemplateId}
          onMutated={() => {
            void loadTemplates();
          }}
        />
      </div>
    </div>
  );
}

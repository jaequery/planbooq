"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { createContextDoc, deleteContextDoc, updateContextDoc } from "@/actions/context-docs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContextDocKind, ContextDocSummary } from "@/lib/types";

type Props = {
  workspaceId: string;
  projectId: string;
  projectName: string;
  initialDocs: ContextDocSummary[];
};

const KINDS: readonly ContextDocKind[] = [
  "SCOPE",
  "DECISION",
  "ARCHITECTURE",
  "DEPENDENCY",
  "CONSTRAINT",
  "PATTERN",
  "OTHER",
];

const KIND_LABEL: Record<ContextDocKind, string> = {
  SCOPE: "Scope",
  DECISION: "Decision",
  ARCHITECTURE: "Architecture",
  DEPENDENCY: "Dependency",
  CONSTRAINT: "Constraint",
  PATTERN: "Pattern",
  OTHER: "Other",
};

export function ContextListClient({
  workspaceId,
  projectId,
  projectName,
  initialDocs,
}: Props): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<ContextDocKind>("OTHER");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const resetForm = useCallback(() => {
    setEditingId(null);
    setKind("OTHER");
    setTitle("");
    setBody("");
  }, []);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    startTransition(async () => {
      const r = editingId
        ? await updateContextDoc({
            id: editingId,
            title: title.trim(),
            body: body.trim(),
            kind,
          })
        : await createContextDoc({
            workspaceId,
            projectId,
            title: title.trim(),
            body: body.trim(),
            kind,
          });
      if (!r.ok) {
        toast.error(`Couldn't save: ${r.error}`);
        return;
      }
      toast.success(editingId ? "Updated" : "Created");
      setOpen(false);
      resetForm();
      router.refresh();
    });
  }, [editingId, title, body, kind, projectId, workspaceId, router, resetForm]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm("Delete this context doc? This cannot be undone.")) return;
      startTransition(async () => {
        const r = await deleteContextDoc({ id });
        if (!r.ok) {
          toast.error(`Couldn't delete: ${r.error}`);
          return;
        }
        toast.success("Deleted");
        router.refresh();
      });
    },
    [router],
  );

  const openCreate = (): void => {
    resetForm();
    setOpen(true);
  };

  const openEdit = async (doc: ContextDocSummary): Promise<void> => {
    setEditingId(doc.id);
    setKind(doc.kind);
    setTitle(doc.title);
    // Need the body — list query omits it. Fetch via the get action.
    const res = await fetch(`/api/v1/context-docs/${doc.id}`, { credentials: "same-origin" });
    if (res.ok) {
      const data = (await res.json()) as { body?: string };
      setBody(data.body ?? "");
    }
    setOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <div>
          <h1 className="text-lg font-medium">Context</h1>
          <p className="text-[12px] text-muted-foreground">
            Reference docs for <span className="font-medium text-foreground">{projectName}</span>.
            Mirrors canonical repo files so agents see them through the worktree.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          New context
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {initialDocs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              No context docs yet. Capture scope, decisions, architecture notes, and constraints
              here so agents have authoritative reference material.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {initialDocs.map((doc) => (
              <li
                key={doc.id}
                className="group rounded-md border border-border/60 bg-card/30 px-4 py-3 transition-colors hover:bg-card/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
                    onClick={() => {
                      void openEdit(doc);
                    }}
                  >
                    <span className="truncate text-[14px] font-medium">{doc.title}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {KIND_LABEL[doc.kind]}
                      </Badge>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => handleDelete(doc.id)}
                    disabled={pending}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit context" : "New context"}</DialogTitle>
            <DialogDescription>
              Use markdown. Keep one concept per doc — small, focused notes are easier for agents to
              reference precisely.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ctx-title">Title</Label>
              <Input
                id="ctx-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. Auth: NextAuth v5 + magic link"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ctx-kind">Kind</Label>
              <select
                id="ctx-kind"
                className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
                value={kind}
                onChange={(e) => setKind(e.target.value as ContextDocKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ctx-body">Body (markdown)</Label>
              <Textarea
                id="ctx-body"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={200_000}
                placeholder="# Auth&#10;NextAuth v5 beta with database sessions and magic-link via Nodemailer..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

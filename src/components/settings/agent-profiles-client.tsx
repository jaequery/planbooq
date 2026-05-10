"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2, MoreHorizontal, Pencil, Plus, Power, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  createAgentProfile,
  deleteAgentProfile,
  draftAgentProfileWithAi,
  getAgentProfile,
  updateAgentProfile,
} from "@/actions/agent-profiles";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AgentProfileSummary } from "@/lib/types";

type Props = {
  workspaceId: string;
  initialProfiles: AgentProfileSummary[];
};

const FormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Max 80 characters"),
  description: z.string().trim().max(280, "Max 280 characters").optional(),
  body: z.string().min(1, "Body is required").max(50_000, "Max 50,000 characters"),
});
type FormValues = z.infer<typeof FormSchema>;

const fmt = (d: Date | null): string =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

const STARTER_BODY = `# Role
Senior frontend engineer.

# Conventions
- Match the project's existing patterns.
- Prefer minimal diffs.

# Constraints
- Don't introduce new dependencies without approval.
`;

export function AgentProfilesClient({ workspaceId, initialProfiles }: Props): React.ReactElement {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; id: string; defaults: FormValues } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  const onCreate = () => setEditor({ mode: "create" });

  const onEdit = (id: string) => {
    startTransition(async () => {
      const r = await getAgentProfile({ id });
      if (!r.ok) {
        toast.error(`Could not load: ${r.error}`);
        return;
      }
      setEditor({
        mode: "edit",
        id,
        defaults: {
          name: r.data.name,
          description: r.data.description ?? "",
          body: r.data.body,
        },
      });
    });
  };

  const onToggleActive = (p: AgentProfileSummary) => {
    startTransition(async () => {
      const r = await updateAgentProfile({ id: p.id, isActive: !p.isActive });
      if (!r.ok) {
        toast.error(`Could not update: ${r.error}`);
        return;
      }
      setProfiles((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, isActive: r.data.isActive, archivedAt: r.data.archivedAt } : x,
        ),
      );
      toast.success(r.data.isActive ? "Activated" : "Deactivated");
    });
  };

  const onDelete = (p: AgentProfileSummary) => {
    if (!confirm(`Delete "${p.name}"? Existing ticket assignments will be archived.`)) return;
    startTransition(async () => {
      const r = await deleteAgentProfile({ id: p.id });
      if (!r.ok) {
        toast.error(`Could not delete: ${r.error}`);
        return;
      }
      if (r.data.purged) {
        setProfiles((prev) => prev.filter((x) => x.id !== p.id));
      } else {
        setProfiles((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, isActive: false, archivedAt: new Date() } : x)),
        );
      }
      toast.success("Deleted");
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">
            AGENTS.md-style personas. Assign one or more to a ticket — each becomes a parallel
            worker when the ticket runs.
          </p>
        </div>
        <Button size="sm" onClick={onCreate} disabled={pending}>
          <Plus className="size-4" />
          New agent
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border">
        {profiles.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No agents yet. Create one to start assigning AGENTS.md personas to tickets.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground">
                    {p.description ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {p.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(p.updatedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Actions for ${p.name}`}
                          disabled={pending}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(p.id)}>
                          <Pencil className="mr-2 size-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleActive(p)}>
                          <Power className="mr-2 size-3.5" />
                          {p.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(p)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editor && (
        <EditorDialog
          key={editor.mode === "edit" ? editor.id : "create"}
          workspaceId={workspaceId}
          initial={editor.mode === "edit" ? editor.defaults : undefined}
          editingId={editor.mode === "edit" ? editor.id : null}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setProfiles((prev) => {
              const i = prev.findIndex((x) => x.id === saved.id);
              const summary: AgentProfileSummary = {
                id: saved.id,
                workspaceId: saved.workspaceId,
                name: saved.name,
                slug: saved.slug,
                description: saved.description,
                isActive: saved.isActive,
                createdAt: saved.createdAt,
                updatedAt: saved.updatedAt,
                archivedAt: saved.archivedAt,
              };
              if (i === -1) return [summary, ...prev];
              const next = [...prev];
              next[i] = summary;
              return next;
            });
            setEditor(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

type EditorProps = {
  workspaceId: string;
  initial?: FormValues;
  editingId: string | null;
  onClose: () => void;
  onSaved: (p: AgentProfileSummary & { body: string }) => void;
};

function EditorDialog({
  workspaceId,
  initial,
  editingId,
  onClose,
  onSaved,
}: EditorProps): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);
  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(FormSchema),
    defaultValues: initial ?? { name: "", description: "", body: STARTER_BODY },
  });

  const onGenerate = async () => {
    const prompt = aiPrompt.trim();
    if (prompt.length < 3) {
      toast.error("Describe the agent in a sentence or two.");
      return;
    }
    setAiBusy(true);
    try {
      const r = await draftAgentProfileWithAi({ workspaceId, prompt });
      if (!r.ok) {
        const msg =
          r.error === "no_key"
            ? "AI generation isn't configured (OPENROUTER_API_KEY missing)."
            : r.error === "openrouter_timeout"
              ? "AI request timed out — try again."
              : `AI generation failed: ${r.error}`;
        toast.error(msg);
        return;
      }
      form.setValue("name", r.data.name, { shouldValidate: true, shouldDirty: true });
      form.setValue("description", r.data.description, {
        shouldValidate: true,
        shouldDirty: true,
      });
      form.setValue("body", r.data.body, { shouldValidate: true, shouldDirty: true });
      setAiDirty(true);
      toast.success("Draft generated — review and save.");
    } finally {
      setAiBusy(false);
    }
  };

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : undefined,
        body: values.body,
      };
      const r = editingId
        ? await updateAgentProfile({ id: editingId, ...payload })
        : await createAgentProfile({ workspaceId, ...payload });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editingId ? "Saved" : "Created");
      onSaved(r.data);
    });
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit agent" : "New agent"}</DialogTitle>
          <DialogDescription>
            Define an AGENTS.md-style persona. Markdown is fine — this is the prompt the worker will
            receive.
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" onSubmit={submit}>
          {!editingId && (
            <div className="flex flex-col gap-1.5 rounded-md border border-dashed bg-muted/40 p-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-muted-foreground" />
                <Label htmlFor="ap-ai-prompt" className="text-xs font-medium">
                  Generate with AI
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Describe the agent in plain language — Planbooq will draft an AGENTS.md persona for
                you to review before saving.
              </p>
              <Textarea
                id="ap-ai-prompt"
                rows={2}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. A meticulous Postgres + Prisma reviewer who flags N+1 queries and missing indexes."
                disabled={aiBusy || pending}
              />
              <div className="flex items-center justify-between gap-2">
                {aiDirty ? (
                  <span className="text-xs text-muted-foreground">
                    Draft inserted below — edit anything before saving.
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Fields below stay editable after generation.
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onGenerate}
                  disabled={aiBusy || pending || aiPrompt.trim().length < 3}
                >
                  {aiBusy ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 size-3.5" /> Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-name">Name</Label>
            <Input
              id="ap-name"
              autoFocus
              {...form.register("name")}
              placeholder="Senior frontend"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-description">Description (optional)</Label>
            <Input
              id="ap-description"
              {...form.register("description")}
              placeholder="React + Tailwind specialist"
            />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-body">AGENTS.md body</Label>
            <Textarea
              id="ap-body"
              rows={14}
              spellCheck={false}
              className="font-mono text-xs"
              {...form.register("body")}
            />
            {form.formState.errors.body && (
              <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Saving…
                </>
              ) : editingId ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

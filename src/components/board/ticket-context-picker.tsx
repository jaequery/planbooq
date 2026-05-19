"use client";

import { Check, FileText, Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  listContextDocs,
  listTicketContextDocs,
  setTicketContextDocs,
} from "@/actions/context-docs";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ContextDocSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
};

export function TicketContextPicker({
  ticketId,
  workspaceId,
  projectId,
}: Props): React.ReactElement {
  const [value, setValue] = useState<ContextDocSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<ContextDocSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void listTicketContextDocs(ticketId).then((r) => {
      if (cancelled) return;
      if (r.ok) setValue(r.data.map((l) => l.contextDoc));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, ticketId]);

  useEffect(() => {
    if (!open || available !== null || loading) return;
    setLoading(true);
    // Project-scoped docs + workspace-global (projectId: null) — fetch both, merge.
    Promise.all([
      listContextDocs({ workspaceId, projectId }),
      listContextDocs({ workspaceId, projectId: null }),
    ])
      .then(([projR, globalR]) => {
        setLoading(false);
        if (!projR.ok || !globalR.ok) {
          toast.error("Could not load context docs");
          return;
        }
        const merged = [...projR.data, ...globalR.data];
        // Dedup (a doc only appears in one bucket, but be safe).
        const byId = new Map<string, ContextDocSummary>();
        for (const d of merged) byId.set(d.id, d);
        setAvailable(Array.from(byId.values()));
      })
      .catch(() => setLoading(false));
  }, [open, workspaceId, projectId, available, loading]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const persist = (next: ContextDocSummary[]): void => {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const r = await setTicketContextDocs({ ticketId, contextDocIds: next.map((d) => d.id) });
      if (!r.ok) {
        setValue(prev);
        toast.error(`Could not update context: ${r.error}`);
      }
    });
  };

  const toggle = (d: ContextDocSummary): void => {
    const has = value.some((v) => v.id === d.id);
    persist(has ? value.filter((v) => v.id !== d.id) : [...value, d]);
  };

  const filtered = (available ?? []).filter(
    (d) => !query.trim() || d.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted/50"
        >
          {value.length === 0 ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Plus className="size-3.5" /> Add context
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              {value.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex h-5 items-center gap-1 rounded-md border border-border/60 px-1.5 text-[11px]"
                  title={d.title}
                >
                  <FileText className="size-3 text-muted-foreground" aria-hidden />
                  <span className="max-w-[140px] truncate">{d.title}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search context…"
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {loading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {available && available.length === 0
                ? "No context docs yet. Create one in the Context pillar."
                : "No matches."}
            </div>
          )}
          {filtered.map((d) => {
            const checked = value.some((v) => v.id === d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Check className={cn("size-3.5 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{d.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {d.projectId ? "Proj" : "WS"}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

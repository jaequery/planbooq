"use client";

import { Check, Plus, Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { listSkills, listTicketSkills, setTicketSkills } from "@/actions/skills";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SkillSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticketId: string;
  workspaceId: string;
};

export function TicketSkillsPicker({ ticketId, workspaceId }: Props): React.ReactElement {
  const [value, setValue] = useState<SkillSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<SkillSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void listTicketSkills(ticketId).then((r) => {
      if (cancelled) return;
      if (r.ok) setValue(r.data.map((l) => l.skill));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, ticketId]);

  useEffect(() => {
    if (!open || available !== null || loading) return;
    setLoading(true);
    void listSkills({ workspaceId }).then((r) => {
      setLoading(false);
      if (!r.ok) {
        toast.error(`Could not load skills: ${r.error}`);
        return;
      }
      setAvailable(r.data);
    });
  }, [open, workspaceId, available, loading]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const persist = (next: SkillSummary[]): void => {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const r = await setTicketSkills({ ticketId, skillIds: next.map((s) => s.id) });
      if (!r.ok) {
        setValue(prev);
        toast.error(`Could not update skills: ${r.error}`);
      }
    });
  };

  const toggle = (s: SkillSummary): void => {
    const has = value.some((v) => v.id === s.id);
    persist(has ? value.filter((v) => v.id !== s.id) : [...value, s]);
  };

  const filtered = (available ?? []).filter(
    (s) => !query.trim() || s.name.toLowerCase().includes(query.toLowerCase()),
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
              <Plus className="size-3.5" /> Add skill
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              {value.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px]"
                  style={{ borderColor: s.color, color: s.color }}
                >
                  <Sparkles className="size-3" aria-hidden />
                  {s.name}
                </span>
              ))}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {loading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {available && available.length === 0
                ? "No skills yet. Add one in the Agents pillar."
                : "No matches."}
            </div>
          )}
          {filtered.map((s) => {
            const checked = value.some((v) => v.id === s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Check className={cn("size-3.5 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate font-medium">{s.name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

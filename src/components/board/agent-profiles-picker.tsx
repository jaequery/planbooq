"use client";

import { Bot, Check, Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  listAgentProfiles,
  listTicketAgentProfiles,
  setTicketAgentProfiles,
} from "@/actions/agent-profiles";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AgentProfileSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticketId: string;
  workspaceId: string;
  initial?: AgentProfileSummary[];
  onChange?: (next: AgentProfileSummary[]) => void;
};

export function AgentProfileChip({
  profile,
  size = "md",
}: {
  profile: AgentProfileSummary;
  size?: "md" | "sm";
}): React.ReactElement {
  const sizeClass = size === "sm" ? "h-4 px-1 text-[10px] gap-0.5" : "h-5 px-1.5 text-[11px] gap-1";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border/60 text-foreground",
        !profile.isActive && "text-muted-foreground line-through opacity-70",
        sizeClass,
      )}
      title={profile.description ?? profile.name}
    >
      <Bot className={cn(size === "sm" ? "size-2.5" : "size-3")} aria-hidden />
      <span className="truncate">{profile.name}</span>
    </span>
  );
}

export function AgentProfilesPicker({
  ticketId,
  workspaceId,
  initial,
  onChange,
}: Props): React.ReactElement {
  const [value, setValue] = useState<AgentProfileSummary[]>(initial ?? []);
  const [hydrated, setHydrated] = useState(initial !== undefined);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<AgentProfileSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void listTicketAgentProfiles({ ticketId }).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setHydrated(true);
        return;
      }
      setValue(r.data.map((l) => l.profile));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, ticketId]);

  useEffect(() => {
    if (!open || available !== null || loading) return;
    setLoading(true);
    void listAgentProfiles({ workspaceId, includeInactive: false }).then((r) => {
      setLoading(false);
      if (!r.ok) {
        toast.error(`Could not load agents: ${r.error}`);
        return;
      }
      setAvailable(r.data);
    });
  }, [open, workspaceId, available, loading]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const persist = (next: AgentProfileSummary[]): void => {
    const prev = value;
    setValue(next);
    onChange?.(next);
    startTransition(async () => {
      const r = await setTicketAgentProfiles({
        ticketId,
        agentProfileIds: next.map((p) => p.id),
      });
      if (!r.ok) {
        setValue(prev);
        onChange?.(prev);
        toast.error(`Could not update agents: ${r.error}`);
      }
    });
  };

  const toggle = (p: AgentProfileSummary): void => {
    const has = value.some((v) => v.id === p.id);
    persist(has ? value.filter((v) => v.id !== p.id) : [...value, p]);
  };

  const filtered = (available ?? []).filter(
    (p) =>
      !query.trim() ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(query.toLowerCase()),
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
              <Plus className="size-3.5" /> Add agent
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              {value.map((p) => (
                <AgentProfileChip key={p.id} profile={p} />
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
            placeholder="Search agents…"
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {loading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {available && available.length === 0
                ? "No agents yet. Create one in Settings → Agents."
                : "No matches."}
            </div>
          )}
          {filtered.map((p) => {
            const checked = value.some((v) => v.id === p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Check className={cn("size-3.5 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{p.name}</span>
                {p.description && (
                  <span className="truncate text-muted-foreground">{p.description}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-t p-2 text-[11px] text-muted-foreground">
          Each agent runs as its own variant when the ticket is dispatched.
        </div>
      </PopoverContent>
    </Popover>
  );
}

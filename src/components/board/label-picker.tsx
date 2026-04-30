"use client";

import { Check, Plus, Tag } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createLabel, listLabels, updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LABEL_COLORS } from "@/lib/labels";
import type { TicketLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  ticketId: string;
  workspaceId: string;
  value: TicketLabel[];
  onChange: (next: TicketLabel[]) => void;
};

export function LabelChip({
  label,
  size = "md",
}: {
  label: TicketLabel;
  size?: "md" | "sm";
}): React.ReactElement {
  const sizeClass = size === "sm" ? "h-4 px-1 text-[10px] gap-0.5" : "h-5 px-1.5 text-[11px] gap-1";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border/60 text-foreground",
        sizeClass,
      )}
    >
      <span
        aria-hidden
        className={cn("rounded-full", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2")}
        style={{ backgroundColor: label.color }}
      />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

export function LabelPicker({ ticketId, workspaceId, value, onChange }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<TicketLabel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createColor, setCreateColor] = useState<string>(LABEL_COLORS[0]);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || available !== null || loading) return;
    setLoading(true);
    void listLabels({ workspaceId }).then((result) => {
      setLoading(false);
      if (!result.ok) {
        toast.error(`Could not load labels: ${result.error}`);
        return;
      }
      setAvailable(result.data.map((l) => ({ id: l.id, name: l.name, color: l.color })));
    });
  }, [open, workspaceId, available, loading]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreating(false);
      setCreateColor(LABEL_COLORS[0]);
    }
  }, [open]);

  const persist = (nextLabels: TicketLabel[]): void => {
    const previous = value;
    onChange(nextLabels);
    startTransition(async () => {
      const result = await updateTicket({
        ticketId,
        labelIds: nextLabels.map((l) => l.id),
      });
      if (!result.ok) {
        onChange(previous);
        toast.error(`Could not update labels: ${result.error}`);
      }
    });
  };

  const toggle = (label: TicketLabel): void => {
    const has = value.some((l) => l.id === label.id);
    const next = has ? value.filter((l) => l.id !== label.id) : [...value, label];
    persist(next);
  };

  const filtered = (available ?? []).filter((l) =>
    query.trim() ? l.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );
  const exactMatch = (available ?? []).some(
    (l) => l.name.toLowerCase() === query.trim().toLowerCase(),
  );
  const canOfferCreate = query.trim().length > 0 && !exactMatch;

  const submitCreate = (): void => {
    const name = query.trim();
    if (!name || submittingCreate) return;
    setSubmittingCreate(true);
    void createLabel({ workspaceId, name, color: createColor }).then((result) => {
      setSubmittingCreate(false);
      if (!result.ok) {
        toast.error(`Could not create label: ${result.error}`);
        return;
      }
      const created: TicketLabel = {
        id: result.data.id,
        name: result.data.name,
        color: result.data.color,
      };
      setAvailable((prev) => (prev ? [created, ...prev] : [created]));
      setCreating(false);
      setQuery("");
      persist([...value, created]);
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Add label"
          className={cn(
            "h-8 flex-1 justify-start gap-1.5 px-2 text-[13px] font-normal",
            value.length === 0 ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {value.length === 0 ? (
            <>
              <Tag className="h-3.5 w-3.5" aria-hidden />
              <span>Add label</span>
            </>
          ) : (
            <span className="flex min-w-0 items-center gap-1">
              {value.slice(0, 2).map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
              {value.length > 2 ? (
                <span className="text-[11px] text-muted-foreground">+{value.length - 2}</span>
              ) : null}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[260px] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/60 p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or create…"
            aria-label="Search labels"
            className="h-8 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canOfferCreate && !creating) {
                e.preventDefault();
                setCreating(true);
              }
            }}
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1" role="listbox" aria-label="Labels">
          {loading ? (
            <div className="px-2 py-3 text-[12px] text-muted-foreground">Loading…</div>
          ) : null}
          {!loading && available && filtered.length === 0 && !canOfferCreate ? (
            <div className="px-2 py-3 text-[12px] text-muted-foreground">No labels yet</div>
          ) : null}
          {filtered.map((l) => {
            const selected = value.some((v) => v.id === l.id);
            return (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggle(l)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <span className="flex-1 truncate text-left">{l.name}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                ) : null}
              </button>
            );
          })}
          {canOfferCreate && !creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="flex-1 truncate text-left">Create &ldquo;{query.trim()}&rdquo;</span>
            </button>
          ) : null}
        </div>
        {creating ? (
          <div className="border-t border-border/60 p-2">
            <div className="mb-2 text-[12px] text-muted-foreground">
              New label: <span className="text-foreground">{query.trim()}</span>
            </div>
            <div
              role="radiogroup"
              aria-label="Label color"
              className="mb-2 flex flex-wrap items-center gap-1.5"
            >
              {LABEL_COLORS.map((c) => {
                const selected = c === createColor;
                return (
                  <label
                    key={c}
                    aria-label={`Color ${c}`}
                    className={cn(
                      "inline-block h-4 w-4 cursor-pointer rounded-full",
                      selected && "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                    )}
                    style={{ backgroundColor: c }}
                  >
                    <input
                      type="radio"
                      name="label-color"
                      value={c}
                      checked={selected}
                      onChange={() => setCreateColor(c)}
                      className="sr-only"
                    />
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setCreating(false)}
                disabled={submittingCreate}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="xs"
                onClick={submitCreate}
                disabled={submittingCreate || !query.trim()}
              >
                {submittingCreate ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

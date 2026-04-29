"use client";

import { Check, User2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { listWorkspaceMembers, updateTicket } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TicketAssignee } from "@/lib/types";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function AssigneeAvatar({
  name,
  image,
  size = "sm",
  className,
}: {
  name?: string | null;
  image?: string | null;
  size?: "xs" | "sm";
  className?: string;
}): React.ReactElement {
  const dim = size === "xs" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name ?? "assignee"}
        className={cn("shrink-0 rounded-full object-cover", dim, className)}
      />
    );
  }
  if (!name) {
    return (
      <div
        aria-hidden
        className={cn("shrink-0 rounded-full bg-muted-foreground/30", dim, className)}
      />
    );
  }
  const color = AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        dim,
        color,
        className,
      )}
    >
      {initial}
    </div>
  );
}

type Props = {
  ticketId: string;
  workspaceId: string;
  assignee: TicketAssignee | null;
  onChange: (next: TicketAssignee | null) => void;
};

export function AssigneePicker({
  ticketId,
  workspaceId,
  assignee,
  onChange,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TicketAssignee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || members !== null || loading) return;
    setLoading(true);
    void listWorkspaceMembers({ workspaceId }).then((result) => {
      setLoading(false);
      if (!result.ok) {
        toast.error(`Could not load members: ${result.error}`);
        return;
      }
      setMembers(result.data.map((m) => m.user));
    });
  }, [open, workspaceId, members, loading]);

  const select = (next: TicketAssignee | null): void => {
    setOpen(false);
    setQuery("");
    const prevId = assignee?.id ?? null;
    const nextId = next?.id ?? null;
    if (prevId === nextId) return;
    const previous = assignee;
    onChange(next);
    startTransition(async () => {
      const result = await updateTicket({ ticketId, assigneeId: nextId });
      if (!result.ok) {
        onChange(previous);
        toast.error(`Could not update assignee: ${result.error}`);
      }
    });
  };

  const filtered = (members ?? []).filter((m) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (m.name ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Set assignee"
          className={cn(
            "h-8 flex-1 justify-start gap-2 px-2 text-[13px] font-normal",
            assignee ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {assignee ? (
            <AssigneeAvatar name={assignee.name} image={assignee.image} size="xs" />
          ) : (
            <User2 className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="truncate">{assignee?.name ?? assignee?.email ?? "Assign"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[260px] p-0">
        <div className="border-b border-border/60 p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            aria-label="Search members"
            className="h-8 text-[13px]"
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1" role="listbox" aria-label="Members">
          <button
            type="button"
            role="option"
            aria-selected={assignee === null}
            onClick={() => select(null)}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
          >
            <User2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="flex-1 text-left">No assignee</span>
            {assignee === null ? (
              <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            ) : null}
          </button>
          {loading ? (
            <div className="px-2 py-3 text-[12px] text-muted-foreground">Loading…</div>
          ) : null}
          {!loading && members && filtered.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-muted-foreground">No members found</div>
          ) : null}
          {filtered.map((m) => {
            const selected = m.id === assignee?.id;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(m)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <AssigneeAvatar name={m.name} image={m.image} size="xs" />
                <span className="flex-1 truncate text-left">{m.name ?? m.email ?? "Unknown"}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

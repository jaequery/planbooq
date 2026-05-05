"use client";

import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createPairCode, pollPairCode, revokeAgent } from "@/actions/agents";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AgentRow = {
  id: string;
  name: string;
  hostname: string | null;
  platform: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

type Props = {
  workspaceId: string;
  initialAgents: AgentRow[];
};

const fmt = (d: Date | null): string =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function AgentsClient({ workspaceId, initialAgents }: Props): React.ReactElement {
  const router = useRouter();
  const [agents, setAgents] = useState(initialAgents);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !code) return;
    const t = setInterval(async () => {
      const res = await pollPairCode({ code });
      if (res.ok && res.data.status === "claimed") {
        clearInterval(t);
        toast.success("Agent paired");
        setOpen(false);
        setCode(null);
        router.refresh();
      } else if (res.ok && res.data.status === "expired") {
        clearInterval(t);
        toast.error("Pair code expired");
        setCode(null);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [open, code, router]);

  const startPair = () => {
    startTransition(async () => {
      const res = await createPairCode({ workspaceId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCode(res.data.code);
      setOpen(true);
    });
  };

  const onRevoke = (agentId: string) => {
    if (!confirm("Revoke this agent? It will lose access immediately.")) return;
    startTransition(async () => {
      const res = await revokeAgent({ agentId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, revokedAt: new Date() } : a)),
      );
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-medium">Local agents</h2>
          <p className="text-sm text-muted-foreground">
            Pair a machine running the Planbooq agent + Claude Code CLI. Tickets can be dispatched
            to it; output streams back here.
          </p>
        </div>
        <Button size="sm" onClick={startPair} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Pair new agent
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border">
        {agents.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No agents paired yet.</div>
        )}
        {agents.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-4 border-b p-3 last:border-0"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {a.name}
                {a.revokedAt && <span className="ml-2 text-xs text-destructive">revoked</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.hostname ?? "?"} · {a.platform ?? "?"} · last seen {fmt(a.lastSeenAt)}
              </span>
            </div>
            {!a.revokedAt && (
              <Button size="sm" variant="ghost" onClick={() => onRevoke(a.id)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(o) => (!o ? (setOpen(false), setCode(null)) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pair a new agent</DialogTitle>
            <DialogDescription>
              On the machine you want to use, install the agent and run{" "}
              <code className="rounded bg-muted px-1">planbooq-agent login</code>. Enter the code
              below when prompted. Workspace id:{" "}
              <code className="rounded bg-muted px-1">{workspaceId}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-6">
            <span className="font-mono text-3xl tracking-widest">{code ?? "…"}</span>
            {code && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-3"
                onClick={() => {
                  navigator.clipboard.writeText(code);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-4" />
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Code expires in 10 minutes. Waiting for agent…
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => (setOpen(false), setCode(null))}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

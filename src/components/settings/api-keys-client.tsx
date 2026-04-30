"use client";

import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";
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

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  initialKeys: KeyRow[];
};

const fmt = (d: Date | null): string =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

export function ApiKeysClient({
  workspaceId,
  workspaceName,
  initialKeys,
}: Props): React.ReactElement {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [justCreated, setJustCreated] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const onCreate = (): void => {
    if (!name.trim()) return;
    startTransition(async () => {
      const r = await createApiKey({ workspaceId, name: name.trim() });
      if (!r.ok) {
        toast.error(`Could not create key: ${r.error}`);
        return;
      }
      setJustCreated({ name: r.data.name, token: r.data.token });
      setName("");
      setCreateOpen(false);
      router.refresh();
    });
  };

  const onRevoke = (id: string, label: string): void => {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const r = await revokeApiKey({ keyId: id });
      if (!r.ok) {
        toast.error(`Could not delete: ${r.error}`);
        return;
      }
      toast.success("Key deleted");
      router.refresh();
    });
  };

  const copyToken = async (): Promise<void> => {
    if (!justCreated) return;
    await navigator.clipboard.writeText(justCreated.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Workspace: <span className="font-medium">{workspaceName}</span>. Keys grant access to
            this workspace's tickets via the REST API. Treat them like passwords.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New key
        </Button>
      </header>

      <div className="overflow-hidden rounded-md border">
        {initialKeys.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No API keys yet. Create one to use the Planbooq Claude skill or any external
            integration.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Prefix</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
                <th className="px-3 py-2 text-left font-medium">Last used</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {initialKeys.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(k.createdAt)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(k.lastUsedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(k.id, k.name)}
                      disabled={pending}
                      aria-label={`Delete ${k.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>
              Give this key a memorable name (e.g. "Claude skill", "CI bot"). You'll only see the
              token once.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              autoFocus
              value={name}
              placeholder="Claude skill"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !pending) onCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={pending || !name.trim()}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <Dialog
        open={!!justCreated}
        onOpenChange={(o) => {
          if (!o) setJustCreated(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              This is the only time the token will be shown. Copy it now and store it somewhere
              safe.
            </DialogDescription>
          </DialogHeader>
          {justCreated ? (
            <div className="flex min-w-0 flex-col gap-3">
              <div className="text-xs text-muted-foreground">{justCreated.name}</div>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                  {justCreated.token}
                </code>
                <Button size="sm" variant="outline" onClick={copyToken} className="shrink-0">
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="min-w-0 rounded-md border bg-muted/30 p-3 text-xs">
                <p className="mb-1 font-medium">Use it like this:</p>
                <code className="block whitespace-pre-wrap break-all font-mono">
                  {`export PLANBOOQ_API_KEY="${justCreated.token}"`}
                </code>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setJustCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

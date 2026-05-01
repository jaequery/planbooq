"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeOpenRouterKey, setOpenRouterKey } from "@/actions/openrouter-key";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = { configured: boolean; last4: string | null };

type Props = {
  workspaceId: string;
  workspaceName: string;
  initialStatus: Status;
};

export function OpenRouterKeyClient({
  workspaceId,
  workspaceName,
  initialStatus,
}: Props): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [keyInput, setKeyInput] = useState("");
  const [pending, startTransition] = useTransition();

  const shapeOk = keyInput.startsWith("sk-or-") && keyInput.length >= 20;

  const onSave = (): void => {
    if (!shapeOk) {
      toast.error("Key must start with sk-or- and be at least 20 characters");
      return;
    }
    startTransition(async () => {
      const r = await setOpenRouterKey({ workspaceId, apiKey: keyInput.trim() });
      if (!r.ok) {
        toast.error(`Could not save: ${r.error}`);
        return;
      }
      setStatus(r.data);
      setKeyInput("");
      toast.success("OpenRouter key saved");
      router.refresh();
    });
  };

  const onRemove = (): void => {
    if (!confirm("Remove the OpenRouter key for this workspace?")) return;
    startTransition(async () => {
      const r = await removeOpenRouterKey({ workspaceId });
      if (!r.ok) {
        toast.error(`Could not remove: ${r.error}`);
        return;
      }
      setStatus(r.data);
      toast.success("Key removed");
      router.refresh();
    });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">OpenRouter</h1>
        <p className="text-sm text-muted-foreground">
          Connect an OpenRouter API key for {workspaceName} to execute tickets in the cloud instead
          of from Claude Code.
        </p>
      </header>

      <section className="rounded-lg border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Status</span>
            <span className="text-sm text-muted-foreground">
              {status.configured && status.last4
                ? `Configured · sk-or-…••${status.last4}`
                : "Not set"}
            </span>
          </div>
          {status.configured ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onRemove}
              aria-label="Remove key"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove
            </Button>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="openrouter-key">{status.configured ? "Replace key" : "API key"}</Label>
          <Input
            id="openrouter-key"
            type="password"
            placeholder="sk-or-..."
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            disabled={pending}
          />
          <span className="text-xs text-muted-foreground">
            Stored encrypted at rest. Never returned to the browser after save.
          </span>
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending || !shapeOk}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </section>
    </div>
  );
}

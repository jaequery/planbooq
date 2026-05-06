"use client";

import { Play, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { executeTicket, planTicket } from "@/actions/ticket-llm";
import { Button } from "@/components/ui/button";

type Props = {
  ticketId: string;
  statusKey: string | undefined;
};

type ActionConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: (ticketId: string) => Promise<{ ok: boolean; error?: string }>;
  successMsg: string;
};

const ACTIONS: Record<string, ActionConfig> = {
  backlog: {
    label: "Plan",
    icon: Sparkles,
    run: async (ticketId) => {
      const r = await planTicket({ ticketId });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    successMsg: "Plan generated. Moved to Todo.",
  },
  todo: {
    label: "Execute",
    icon: Play,
    run: async (ticketId) => {
      const r = await executeTicket({ ticketId });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    successMsg: "Dispatched to agent. Moved to Building.",
  },
};

export function TicketActionButton({ ticketId, statusKey }: Props): React.ReactElement | null {
  const [pending, startTransition] = useTransition();
  const config = statusKey ? ACTIONS[statusKey] : null;
  if (!config) return null;
  const Icon = config.icon;

  const onClick = (): void => {
    startTransition(async () => {
      const result = await config.run(ticketId);
      if (result.ok) {
        toast.success(config.successMsg);
      } else {
        const msg =
          result.error === "no_agent_paired"
            ? "No paired agent in this workspace. Pair an agent first."
            : result.error === "no_key"
              ? "OpenRouter API key not configured."
              : (result.error ?? "Action failed");
        toast.error(msg);
      }
    });
  };

  return (
    <Button type="button" size="sm" onClick={onClick} disabled={pending}>
      <Icon className="h-3.5 w-3.5" />
      {pending ? `${config.label}…` : config.label}
    </Button>
  );
}

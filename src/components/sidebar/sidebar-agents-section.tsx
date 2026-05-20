"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarSection } from "@/components/sidebar/sidebar-section";
import type { AgentProfileSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  agents: ReadonlyArray<AgentProfileSummary>;
  initialExpanded: boolean;
};

export function SidebarAgentsSection({ agents, initialExpanded }: Props): React.ReactElement {
  const pathname = usePathname();

  return (
    <SidebarSection
      name="AGENTS"
      label="Agents"
      count={agents.length}
      initialExpanded={initialExpanded}
      indexHref="/agents"
    >
      {agents.length === 0 ? (
        <p className="px-4 pt-1 pb-2 text-[12px] text-muted-foreground/70">
          No agents yet.{" "}
          <Link href="/agents" className="underline hover:text-foreground">
            Create one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-px px-2 pb-1">
          {agents.map((agent) => {
            const href = `/agents`;
            const active = pathname === href;
            return (
              <li key={agent.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors duration-[120ms] ease-out",
                    active
                      ? "bg-foreground/[0.06] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                  title={agent.description ?? undefined}
                >
                  <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{agent.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarSection>
  );
}

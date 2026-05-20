"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentProfileSummary } from "@/lib/types";

type Props = {
  initialProfiles: AgentProfileSummary[];
};

export function AgentsDirectoryClient({ initialProfiles }: Props): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <div>
          <h1 className="text-lg font-medium">Agents</h1>
          <p className="text-[12px] text-muted-foreground">
            Agent personas (AGENTS.md) shared across every project in this workspace. Manage details
            in Settings → Agent Profiles.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/agent-profiles">Manage profiles</Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {initialProfiles.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              No agent profiles yet. Create one in Settings → Agent Profiles to define a persona
              (role, conventions, tools) that can be attached to tickets.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {initialProfiles.map((profile) => (
              <li
                key={profile.id}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-card/30 px-4 py-3"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06]">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{profile.name}</span>
                    {!profile.isActive ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactive
                      </Badge>
                    ) : null}
                  </div>
                  {profile.description ? (
                    <p className="line-clamp-2 text-[12px] text-muted-foreground">
                      {profile.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

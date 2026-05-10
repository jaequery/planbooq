"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";

type TabValue = "appearance" | "shortcuts" | "api-keys" | "workflows" | "agents" | "local-agents";

type TabDef = {
  value: TabValue;
  label: string;
  description: string;
  keywords: string;
};

type GroupDef = {
  id: string;
  label: string;
  tabs: TabDef[];
};

const GROUPS: GroupDef[] = [
  {
    id: "preferences",
    label: "Preferences",
    tabs: [
      {
        value: "appearance",
        label: "Appearance",
        description: "Theme and display",
        keywords: "appearance theme dark light system display",
      },
      {
        value: "shortcuts",
        label: "Shortcuts",
        description: "Keyboard shortcuts",
        keywords: "shortcuts keyboard hotkey keybinding cmd ctrl",
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    tabs: [
      {
        value: "workflows",
        label: "Workflows",
        description: "Ticket steps and prompts",
        keywords: "workflows steps prompts templates default",
      },
      {
        value: "agents",
        label: "Agents",
        description: "Agent profiles",
        keywords: "agents profiles ai claude codex",
      },
      {
        value: "local-agents",
        label: "Local agents",
        description: "Desktop runners",
        keywords: "local agents desktop runners machines",
      },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    tabs: [
      {
        value: "api-keys",
        label: "API keys",
        description: "Tokens for skills and automations",
        keywords: "api keys tokens bearer pbq_live skills automation",
      },
    ],
  },
];

type Props = {
  appearance: React.ReactNode;
  shortcuts: React.ReactNode;
  apiKeys: React.ReactNode;
  workflows: React.ReactNode;
  agents: React.ReactNode;
  localAgents: React.ReactNode;
};

export function SettingsTabs({
  appearance,
  shortcuts,
  apiKeys,
  workflows,
  agents,
  localAgents,
}: Props): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();
  const onSettingsRoute = pathname === "/settings";
  const [query, setQuery] = useState("");

  const visibleGroups = useMemo<GroupDef[]>(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => {
        if (t.value === "local-agents" && isDesktop) return false;
        if (!q) return true;
        return (
          t.label.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.keywords.includes(q)
        );
      }),
    })).filter((g) => g.tabs.length > 0);
  }, [isDesktop, query]);

  const allValid = useMemo<TabValue[]>(
    () =>
      GROUPS.flatMap((g) => g.tabs)
        .filter((t) => !(t.value === "local-agents" && isDesktop))
        .map((t) => t.value),
    [isDesktop],
  );

  const param = searchParams.get("tab");
  const fromUrl: TabValue =
    (allValid.find((v) => v === param) as TabValue | undefined) ?? "appearance";
  const [internalActive, setInternalActive] = useState<TabValue>(fromUrl);
  const active: TabValue = onSettingsRoute ? fromUrl : internalActive;

  const onValueChange = useCallback(
    (value: string) => {
      const next = value as TabValue;
      if (!onSettingsRoute) {
        setInternalActive(next);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (next === "appearance") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `/settings?${qs}` : "/settings", { scroll: false });
    },
    [onSettingsRoute, router, searchParams],
  );

  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={onValueChange}
      orientation="vertical"
      className="flex flex-col gap-4 md:flex-row md:gap-6"
    >
      <aside className="flex flex-col gap-3 md:w-56 md:shrink-0">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className={cn(
              "h-8 w-full rounded-md border bg-background pl-8 pr-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          />
        </div>
        <TabsPrimitive.List aria-label="Settings sections" className="flex flex-col gap-3">
          {visibleGroups.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">No matches.</p>
          ) : (
            visibleGroups.map((g) => (
              <div key={g.id} className="flex flex-col gap-1">
                <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </div>
                {g.tabs.map((t) => (
                  <TabsPrimitive.Trigger
                    key={t.value}
                    value={t.value}
                    className={cn(
                      "inline-flex h-8 w-full items-center rounded-md px-2 text-left text-sm font-medium text-muted-foreground transition-colors",
                      "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "data-[state=active]:bg-muted data-[state=active]:text-foreground",
                    )}
                  >
                    {t.label}
                  </TabsPrimitive.Trigger>
                ))}
              </div>
            ))
          )}
        </TabsPrimitive.List>
      </aside>
      <div className="min-w-0 flex-1">
        <TabsPrimitive.Content value="appearance" className="focus-visible:outline-none">
          {appearance}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="shortcuts" className="focus-visible:outline-none">
          {shortcuts}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="api-keys" className="focus-visible:outline-none">
          {apiKeys}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="workflows" className="focus-visible:outline-none">
          {workflows}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="agents" className="focus-visible:outline-none">
          {agents}
        </TabsPrimitive.Content>
        {!isDesktop && (
          <TabsPrimitive.Content value="local-agents" className="focus-visible:outline-none">
            {localAgents}
          </TabsPrimitive.Content>
        )}
      </div>
    </TabsPrimitive.Root>
  );
}

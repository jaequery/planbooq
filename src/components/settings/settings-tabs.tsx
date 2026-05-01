"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

type TabValue = "appearance" | "api-keys";

const TABS: { value: TabValue; label: string }[] = [
  { value: "appearance", label: "Appearance" },
  { value: "api-keys", label: "API keys" },
];

type Props = {
  appearance: React.ReactNode;
  apiKeys: React.ReactNode;
};

export function SettingsTabs({ appearance, apiKeys }: Props): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const active: TabValue = param === "api-keys" ? "api-keys" : "appearance";

  const onValueChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "appearance") params.delete("tab");
      else params.set("tab", value);
      const qs = params.toString();
      router.replace(qs ? `/settings?${qs}` : "/settings", { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={onValueChange}
      className="flex flex-col gap-6"
    >
      <TabsPrimitive.List className="inline-flex w-fit items-center gap-1 rounded-full border bg-muted/30 p-1">
        {TABS.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
            )}
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      <TabsPrimitive.Content value="appearance" className="focus-visible:outline-none">
        {appearance}
      </TabsPrimitive.Content>
      <TabsPrimitive.Content value="api-keys" className="focus-visible:outline-none">
        {apiKeys}
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  );
}

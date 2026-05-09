"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebarState } from "@/components/sidebar/sidebar-state";

export function SidebarToggle(): React.ReactElement {
  const { collapsed, toggle } = useSidebarState();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={!collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] ease-out hover:bg-foreground/[0.04] hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SHORTCUTS, type ProjectShortcuts } from "@/lib/shortcuts/defaults";

const ShortcutsContext = createContext<ProjectShortcuts>(DEFAULT_SHORTCUTS);

export function ShortcutsProvider({
  shortcuts,
  children,
}: {
  shortcuts: ProjectShortcuts;
  children: React.ReactNode;
}): React.ReactElement {
  return <ShortcutsContext.Provider value={shortcuts}>{children}</ShortcutsContext.Provider>;
}

export function useShortcuts(): ProjectShortcuts {
  return useContext(ShortcutsContext);
}

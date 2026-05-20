"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { updateSidebarSectionState } from "@/actions/user-preferences";
import type { SidebarSectionName } from "@/lib/shortcuts/defaults";
import { cn } from "@/lib/utils";

type Props = {
  name: SidebarSectionName;
  /** Pretty label shown in the header (defaults to the name itself). */
  label?: string;
  /** Item count badge. Omit to hide the badge. */
  count?: number;
  /** Initial expanded state, read from User.preferences on the server. */
  initialExpanded: boolean;
  /** Route that the header label links to (e.g. `/agents`). */
  indexHref?: string;
  /** Optional action node rendered to the right of the count (e.g. + button). */
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function SidebarSection({
  name,
  label,
  count,
  initialExpanded,
  indexHref,
  action,
  children,
}: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [, startTransition] = useTransition();

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    startTransition(() => {
      void updateSidebarSectionState({ name, expanded: next });
    });
  }, [expanded, name]);

  const headerLabel = label ?? name;

  return (
    <section className="flex flex-col">
      <div
        className={cn(
          "flex h-7 items-center gap-1 pr-1 pl-1",
          "text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? `Collapse ${headerLabel}` : `Expand ${headerLabel}`}
          aria-expanded={expanded}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform duration-150 ease-out",
              expanded ? "rotate-90" : "rotate-0",
            )}
          />
        </button>
        {indexHref ? (
          <Link
            href={indexHref}
            className="flex h-5 min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <span className="truncate">{headerLabel}</span>
            {typeof count === "number" && count > 0 ? (
              <span className="text-muted-foreground/50 normal-case">{count}</span>
            ) : null}
          </Link>
        ) : (
          <span className="flex h-5 min-w-0 flex-1 items-center gap-1.5 px-1.5">
            <span className="truncate">{headerLabel}</span>
            {typeof count === "number" && count > 0 ? (
              <span className="text-muted-foreground/50 normal-case">{count}</span>
            ) : null}
          </span>
        )}
        {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
      </div>
      {expanded ? <div className="flex flex-col">{children}</div> : null}
    </section>
  );
}

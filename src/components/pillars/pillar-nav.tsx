"use client";

import { FileText, Kanban } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = { slug: string };

const PILLARS = [
  { key: "tasks", label: "Tasks", suffix: "", icon: Kanban },
  { key: "context", label: "Context", suffix: "/context", icon: FileText },
] as const;

export function PillarNav({ slug }: Props): React.ReactElement {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  return (
    <nav className="flex items-center gap-1 text-[13px]" aria-label="Project section">
      {PILLARS.map((pillar) => {
        const href = `${base}${pillar.suffix}`;
        const active =
          pillar.suffix === ""
            ? pathname === base || pathname === `${base}/`
            : pathname === href || pathname.startsWith(`${href}/`);
        const Icon = pillar.icon;
        return (
          <Link
            key={pillar.key}
            href={href}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 transition-colors duration-[120ms] ease-out",
              active
                ? "bg-foreground/[0.06] text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {pillar.label}
          </Link>
        );
      })}
    </nav>
  );
}

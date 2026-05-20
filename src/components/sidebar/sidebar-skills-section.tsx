"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarSection } from "@/components/sidebar/sidebar-section";
import type { SkillSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  skills: ReadonlyArray<SkillSummary>;
  initialExpanded: boolean;
};

export function SidebarSkillsSection({ skills, initialExpanded }: Props): React.ReactElement {
  const pathname = usePathname();

  return (
    <SidebarSection
      name="SKILLS"
      label="Skills"
      count={skills.length}
      initialExpanded={initialExpanded}
      indexHref="/skills"
    >
      {skills.length === 0 ? (
        <p className="px-4 pt-1 pb-2 text-[12px] text-muted-foreground/70">
          No skills yet.{" "}
          <Link href="/skills" className="underline hover:text-foreground">
            Add one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-px px-2 pb-1">
          {skills.map((skill) => {
            const href = `/skills`;
            const active = pathname === href;
            return (
              <li key={skill.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors duration-[120ms] ease-out",
                    active
                      ? "bg-foreground/[0.06] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                  title={skill.description ?? undefined}
                >
                  <Sparkles
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: skill.color ?? undefined }}
                  />
                  <span className="truncate">{skill.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarSection>
  );
}

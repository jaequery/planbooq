"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { createSkill, deleteSkill } from "@/actions/skills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SkillSummary } from "@/lib/types";

type Props = {
  workspaceId: string;
  skills: SkillSummary[];
};

export function SkillsManager({ workspaceId, skills }: Props): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const handleAdd = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const r = await createSkill({ workspaceId, name: trimmed });
      if (!r.ok) {
        toast.error(`Couldn't add skill: ${r.error}`);
        return;
      }
      setName("");
      router.refresh();
    });
  }, [name, workspaceId, router]);

  const handleRemove = useCallback(
    (id: string) => {
      startTransition(async () => {
        const r = await deleteSkill({ id });
        if (!r.ok) {
          toast.error(`Couldn't remove: ${r.error}`);
          return;
        }
        router.refresh();
      });
    },
    [router],
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[13px] font-medium">Skills</h2>
        <p className="text-[12px] text-muted-foreground">
          Tag agents and tickets with capability tags so you can match the right agent to the right
          work at a glance.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a skill (e.g. TypeScript, Prisma, Tailwind)"
          maxLength={60}
          className="h-8"
        />
        <Button size="sm" onClick={handleAdd} disabled={pending || !name.trim()}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {skills.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No skills yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li key={skill.id}>
              <Badge
                variant="secondary"
                className="gap-1.5 pr-1 text-[11px]"
                style={{ borderColor: skill.color, color: skill.color }}
              >
                {skill.name}
                <button
                  type="button"
                  className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-foreground/10"
                  aria-label={`Remove ${skill.name}`}
                  onClick={() => handleRemove(skill.id)}
                  disabled={pending}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

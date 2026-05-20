import { notFound, redirect } from "next/navigation";
import { SkillsManager } from "@/components/skills/skills-manager";
import type { SkillSummary } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function WorkspaceSkillsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!membership) notFound();

  const skillRows = await prisma.skill.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      slug: true,
      description: true,
      color: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const skills: SkillSummary[] = skillRows;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <div>
          <h1 className="text-lg font-medium">Skills</h1>
          <p className="text-[12px] text-muted-foreground">
            Capability tags shared across every project. Attach them to agents and tickets to match
            the right agent to the right work.
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <SkillsManager workspaceId={membership.workspaceId} skills={skills} />
      </div>
    </div>
  );
}

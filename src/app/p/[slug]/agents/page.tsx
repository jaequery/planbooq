import { notFound, redirect } from "next/navigation";
import { AgentsDirectoryClient } from "@/components/agents/agents-directory-client";
import type { AgentProfileSummary, SkillSummary } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = { params: Promise<{ slug: string }> };

export default async function AgentsPage({ params }: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const { slug } = await params;
  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId: membership.workspaceId, slug } },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const [profileRows, skillRows] = await Promise.all([
    prisma.agentProfile.findMany({
      where: { workspaceId: membership.workspaceId, isActive: true, archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
      },
    }),
    prisma.skill.findMany({
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
    }),
  ]);

  const profiles: AgentProfileSummary[] = profileRows;
  const skills: SkillSummary[] = skillRows;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentsDirectoryClient
        workspaceId={membership.workspaceId}
        initialProfiles={profiles}
        initialSkills={skills}
      />
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { AgentsDirectoryClient } from "@/components/agents/agents-directory-client";
import type { AgentProfileSummary } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function WorkspaceAgentsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!membership) notFound();

  const profileRows = await prisma.agentProfile.findMany({
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
  });

  const profiles: AgentProfileSummary[] = profileRows;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentsDirectoryClient initialProfiles={profiles} />
    </div>
  );
}

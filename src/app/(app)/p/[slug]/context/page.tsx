import { notFound, redirect } from "next/navigation";
import { ContextListClient } from "@/components/context/context-list-client";
import type { ContextDocSummary } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = { params: Promise<{ slug: string }> };

export default async function ContextPage({ params }: Props): Promise<React.ReactElement> {
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

  const rows = await prisma.contextDoc.findMany({
    where: {
      workspaceId: membership.workspaceId,
      projectId: project.id,
      archivedAt: null,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      title: true,
      kind: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
    },
  });

  const docs: ContextDocSummary[] = rows;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ContextListClient
        workspaceId={membership.workspaceId}
        projectId={project.id}
        projectName={project.name}
        initialDocs={docs}
      />
    </div>
  );
}

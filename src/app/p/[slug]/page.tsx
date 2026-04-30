import { notFound, redirect } from "next/navigation";
import { Board } from "@/components/board/board";
import type { BoardData } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = { params: Promise<{ slug: string }> };

export default async function ProjectPage({ params }: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { slug } = await params;

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: {
      workspaceId_slug: { workspaceId: membership.workspaceId, slug },
    },
  });
  if (!project) notFound();

  const [statuses, allProjects] = await Promise.all([
    prisma.status.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { position: "asc" },
      include: {
        tickets: {
          where: { projectId: project.id, archivedAt: null },
          orderBy: { position: "asc" },
          include: {
            assignee: { select: { id: true, name: true, email: true, image: true } },
            labels: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true, color: true },
    }),
  ]);

  const boardData: BoardData = {
    project,
    statuses,
    allProjects,
  };

  return <Board initialData={boardData} currentUserId={session.user.id} />;
}

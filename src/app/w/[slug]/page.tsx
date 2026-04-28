import { notFound, redirect } from "next/navigation";
import { Board } from "@/components/board/board";
import type { BoardData } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = { params: Promise<{ slug: string }> };

export default async function WorkspacePage({ params }: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { slug } = await params;

  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const member = await prisma.member.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: session.user.id,
      },
    },
  });
  if (!member) notFound();

  const statuses = await prisma.status.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { position: "asc" },
    include: {
      tickets: {
        orderBy: { position: "asc" },
      },
    },
  });

  const boardData: BoardData = {
    workspace,
    statuses,
  };

  return <Board initialData={boardData} />;
}

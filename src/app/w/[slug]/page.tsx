import { notFound } from "next/navigation";
import { Board } from "@/components/board/board";
import type { BoardData } from "@/lib/types";
import { prisma } from "@/server/db";

type Props = { params: Promise<{ slug: string }> };

export default async function WorkspacePage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      statuses: {
        orderBy: { position: "asc" },
        include: {
          tickets: {
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!workspace) notFound();

  const { statuses, ...rest } = workspace;
  const boardData: BoardData = {
    workspace: rest,
    statuses,
  };

  return <Board initialData={boardData} />;
}

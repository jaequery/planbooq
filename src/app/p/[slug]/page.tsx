import { notFound, redirect } from "next/navigation";
import { Board } from "@/components/board/board";
import { TICKET_PAGE_SIZE } from "@/lib/pagination";
import type { BoardData, StatusWithTickets, TicketWithRelations } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { hydrateWaitingSince } from "@/server/services/ticket-waiting";

type Props = { params: Promise<{ slug: string }> };

export default async function ProjectPage({ params }: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
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
          orderBy: [{ position: "desc" }, { id: "desc" }],
          // Fetch one extra row per column to detect whether more pages exist
          // without a second count query.
          take: TICKET_PAGE_SIZE + 1,
          include: {
            assignee: { select: { id: true, name: true, email: true, image: true } },
            labels: { select: { id: true, name: true, color: true } },
            previews: {
              where: { attachment: { mimeType: { startsWith: "image/" } } },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              take: 4,
              select: {
                id: true,
                attachmentId: true,
                attachment: { select: { mimeType: true } },
              },
            },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        description: true,
        localPath: true,
      },
    }),
  ]);

  const statusKeysById: Record<string, string> = {};
  for (const s of statuses) statusKeysById[s.id] = s.key;

  const trimmedByStatus = statuses.map((s) => {
    const hasMore = s.tickets.length > TICKET_PAGE_SIZE;
    const trimmed = hasMore ? s.tickets.slice(0, TICKET_PAGE_SIZE) : s.tickets;
    const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;
    return { status: s, trimmed, nextCursor };
  });

  const allTickets = trimmedByStatus.flatMap(({ trimmed }) =>
    trimmed.map((t) => ({ id: t.id, statusId: t.statusId, createdAt: t.createdAt })),
  );
  const waitingByTicket = await hydrateWaitingSince(allTickets, statusKeysById);

  const statusesWithImagePreviews: StatusWithTickets[] = trimmedByStatus.map(
    ({ status, trimmed, nextCursor }) => ({
      ...status,
      nextCursor,
      tickets: trimmed.map((t): TicketWithRelations => {
        const { previews, ...rest } = t;
        return {
          ...rest,
          imagePreviews: previews.map((p) => ({
            id: p.id,
            attachmentId: p.attachmentId,
            mimeType: p.attachment.mimeType,
          })),
          waitingSince: waitingByTicket.get(t.id) ?? null,
        };
      }),
    }),
  );

  const boardData: BoardData = {
    project,
    statuses: statusesWithImagePreviews,
    allProjects,
  };

  return <Board initialData={boardData} currentUserId={session.user.id} />;
}

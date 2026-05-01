import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar/sidebar";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function ProjectLayout({
  children,
  params,
}: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/signin");
  }

  const { slug } = await params;

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true, workspace: { select: { name: true } } },
  });
  if (!membership) notFound();

  const [project, projectRows, statusRows] = await Promise.all([
    prisma.project.findUnique({
      where: { workspaceId_slug: { workspaceId: membership.workspaceId, slug } },
    }),
    prisma.project.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true, color: true },
    }),
    prisma.status.findMany({
      where: {
        workspaceId: membership.workspaceId,
        key: { in: ["review", "building"] },
      },
      select: { id: true, key: true },
    }),
  ]);
  if (!project) notFound();

  const trackedStatusIds = statusRows.map((s) => s.id);
  const ticketCounts = trackedStatusIds.length
    ? await prisma.ticket.groupBy({
        by: ["projectId", "statusId"],
        where: {
          workspaceId: membership.workspaceId,
          statusId: { in: trackedStatusIds },
        },
        _count: { _all: true },
      })
    : [];
  const statusKeyById = new Map(statusRows.map((s) => [s.id, s.key]));
  const allProjects = projectRows.map((p) => {
    let reviewCount = 0;
    let buildingCount = 0;
    for (const c of ticketCounts) {
      if (c.projectId !== p.id) continue;
      const key = statusKeyById.get(c.statusId);
      if (key === "review") reviewCount = c._count._all;
      else if (key === "building") buildingCount = c._count._all;
    }
    return { ...p, reviewCount, buildingCount };
  });

  return (
    <div className="flex h-screen min-h-0 bg-background">
      <Sidebar
        projects={allProjects}
        workspaceLabel={membership.workspace.name}
        workspaceId={membership.workspaceId}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <div className="flex items-center gap-2.5 text-[13px]">
            <span className="text-muted-foreground/60">{membership.workspace.name}</span>
            <span className="text-muted-foreground/40">/</span>
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="font-medium text-foreground">{project.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <UserMenu
              email={session.user.email}
              name={session.user.name}
              image={session.user.image}
            />
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

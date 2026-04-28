import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
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

  const [project, allProjects] = await Promise.all([
    prisma.project.findUnique({
      where: { workspaceId_slug: { workspaceId: membership.workspaceId, slug } },
    }),
    prisma.project.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true, color: true },
    }),
  ]);
  if (!project) notFound();

  return (
    <div className="flex h-screen min-h-0 bg-background">
      <Sidebar projects={allProjects} workspaceLabel={membership.workspace.name} />
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
            <ThemeToggle />
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

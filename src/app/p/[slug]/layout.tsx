import { notFound, redirect } from "next/navigation";
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
    select: { workspaceId: true },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: {
      workspaceId_slug: { workspaceId: membership.workspaceId, slug },
    },
  });
  if (!project) notFound();

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-3">
          <div className="font-mono text-sm font-semibold tracking-tight">Planbooq</div>
          <span className="text-muted-foreground/50">/</span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            {project.name}
          </div>
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
  );
}

import { notFound, redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function WorkspaceLayout({
  children,
  params,
}: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
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
  if (!member) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        You don&apos;t have access to this workspace.
      </main>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-3">
          <div className="font-mono text-sm font-semibold tracking-tight">Planbooq</div>
          <span className="text-muted-foreground/50">/</span>
          <div className="text-sm font-medium">{workspace.name}</div>
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

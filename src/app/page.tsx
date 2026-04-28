import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyProjectsState } from "@/components/sidebar/empty-projects-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function Home(): Promise<React.ReactElement> {
  const session = await auth();
  if (session?.user?.id && session.user.email) {
    const membership = await prisma.member.findFirst({
      where: { userId: session.user.id },
      include: {
        workspace: {
          include: {
            projects: {
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      const firstProject = membership.workspace.projects[0];
      if (firstProject) {
        redirect(`/p/${firstProject.slug}`);
      }
      // Authed user with a workspace but zero projects — defensive empty state.
      return (
        <div className="flex min-h-screen flex-col bg-background">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
            <div className="font-mono text-[13px] font-semibold tracking-tight">
              {membership.workspace.name}
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
          <main className="flex flex-1 items-center justify-center px-6">
            <EmptyProjectsState />
          </main>
        </div>
      );
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h1 className="font-mono text-5xl font-semibold tracking-tight sm:text-6xl">Planbooq</h1>
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          A Linear-style issue tracker for vibe coders.
        </p>
        <p className="mt-2 text-base text-muted-foreground">
          Spawn tickets from Claude Code, watch the kanban move itself.
        </p>
        <Button asChild size="lg" className="mt-10">
          <Link href="/signin">
            Sign in <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  );
}

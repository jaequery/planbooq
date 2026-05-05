import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyProjectsState } from "@/components/sidebar/empty-projects-state";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/server/auth";
import { signInWithGitHub } from "@/server/auth-actions";
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
      return (
        <div className="flex min-h-screen flex-col bg-background">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
            <div className="font-mono text-[13px] font-semibold tracking-tight">
              {membership.workspace.name}
            </div>
            <div className="flex items-center gap-1">
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
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h1 className="font-mono text-5xl font-semibold tracking-tight sm:text-6xl">Planbooq</h1>
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          A Linear-style issue tracker for vibe coders.
        </p>
        <p className="mt-2 text-base text-muted-foreground">
          Spawn tickets from Claude Code, watch the kanban move itself.
        </p>
        <form action={signInWithGitHub} className="mt-10">
          <Button size="lg" type="submit">
            <GitHubIcon />
            Continue with GitHub
          </Button>
        </form>
        <p className="mt-3 text-sm text-muted-foreground">
          Planbooq runs on top of your GitHub repos.
        </p>
      </div>
      <footer className="absolute bottom-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </main>
  );
}

function GitHubIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.555 0-.274-.01-1-.015-1.965-3.197.695-3.872-1.54-3.872-1.54-.523-1.328-1.277-1.682-1.277-1.682-1.044-.713.08-.699.08-.699 1.155.082 1.762 1.187 1.762 1.187 1.026 1.758 2.692 1.25 3.349.955.103-.744.402-1.25.732-1.538-2.553-.29-5.237-1.276-5.237-5.679 0-1.255.448-2.281 1.183-3.085-.119-.291-.513-1.46.112-3.043 0 0 .965-.31 3.165 1.178a10.95 10.95 0 0 1 5.762 0c2.198-1.488 3.162-1.178 3.162-1.178.627 1.583.232 2.752.114 3.043.737.804 1.181 1.83 1.181 3.085 0 4.414-2.689 5.385-5.251 5.671.413.355.78 1.058.78 2.133 0 1.54-.014 2.78-.014 3.158 0 .308.207.667.79.554A11.503 11.503 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

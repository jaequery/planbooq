import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function Home() {
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

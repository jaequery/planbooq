import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Planbooq — pick winners, don't prompt twice",
  description:
    "The kanban for vibe coding. Every ticket spawns N AI variants in parallel — pick the winner instead of re-prompting.",
};

const APP_HREF = "/welcome";
const CTA_LABEL = "Open the app";

export default function Home(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="font-mono text-[13px] font-semibold tracking-tight">
          Planbooq
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <a href="#how" className="text-muted-foreground hover:text-foreground">
            How it works
          </a>
          <a href="#why" className="text-muted-foreground hover:text-foreground">
            Why
          </a>
          <a
            href="https://github.com/jaequery/planbooq"
            className="text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
          <Button size="sm" asChild>
            <Link href={APP_HREF}>{CTA_LABEL}</Link>
          </Button>
        </nav>
      </header>

      <section className="relative flex flex-col items-center justify-center px-6 pt-16 pb-24 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <h1 className="font-mono text-5xl font-semibold tracking-tight sm:text-6xl">Planbooq</h1>
          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            Pick winners. Don't prompt twice.
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            Every ticket spawns N AI variants in parallel — each with a live preview URL and
            screenshots. Decide by recognizing the winner, not by re-prompting until "almost"
            becomes "fine."
          </p>
          <div className="mt-10 flex items-center gap-3">
            <Button size="lg" asChild>
              <Link href={APP_HREF}>{CTA_LABEL}</Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">The kanban for vibe coding.</p>
        </div>
      </section>

      <section id="why" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          <Card
            title="Sequential prompting is broken"
            body="Prompt → wait → 'almost but not quite' → re-prompt. It's lossy, exhausting, and fights how humans actually evaluate creative work. We don't specify taste — we recognize it."
          />
          <Card
            title="Parallel beats serial"
            body="N variants run at once in isolated worktrees. By the time one would have finished sequentially, you have several to compare side-by-side."
          />
          <Card
            title="Pick, then ship"
            body="One click merges the chosen variant and archives the rest. No prompt-engineering tax. The picks become the proprietary signal that makes future variants better."
          />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-6 text-base text-muted-foreground sm:text-lg">
            Four steps from prompt to merged PR.
          </p>
        </div>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            n={1}
            title="Drop a ticket"
            body="Describe what you want. Add context, attachments, reference shots."
          />
          <Step
            n={2}
            title="Fan out"
            body="Planbooq spawns multiple AI variants in parallel — each its own branch and worktree."
          />
          <Step
            n={3}
            title="Test-drive"
            body="Open live preview URLs, scrub screenshots, scan diffs. Compare side-by-side."
          />
          <Step
            n={4}
            title="Pick & ship"
            body="One click promotes the winner to a PR. The rest are archived for remix later."
          />
        </ol>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
            Replace Lovable + Cursor + Linear
          </h2>
          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            One surface for the new bottleneck:{" "}
            <span className="text-foreground">deciding fast on AI output.</span>
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            Real-time multiplayer kanban, full keyboard nav, GitHub-wired tickets, BYOK so unit
            economics stay yours.
          </p>
          <div className="mt-10">
            <Button size="lg" asChild>
              <Link href={APP_HREF}>{CTA_LABEL}</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Planbooq runs on top of your GitHub repos.
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span className="font-mono font-semibold tracking-tight">
            © {new Date().getFullYear()} Planbooq
          </span>
          <div className="flex gap-4">
            <a href="https://github.com/jaequery/planbooq" className="hover:text-foreground">
              GitHub
            </a>
            <Link href={APP_HREF} className="hover:text-foreground">
              App
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }): React.ReactElement {
  return (
    <li className="rounded-xl border border-border/60 bg-card p-6">
      <div className="font-mono text-xs font-semibold tracking-tight text-muted-foreground">
        0{n}
      </div>
      <h3 className="mt-2 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}

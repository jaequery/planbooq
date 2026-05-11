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
        <Link href="/" className="font-semibold tracking-tight">
          Planbooq
        </Link>
        <nav className="flex items-center gap-3 text-sm">
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

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          The kanban for vibe coding
        </p>
        <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          Pick winners.{" "}
          <span className="text-muted-foreground">Don't prompt twice.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground">
          Every ticket spawns N AI variants in parallel — each with a live preview URL and
          screenshots. You decide by recognizing the winner, not by re-prompting until "almost"
          becomes "fine."
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href={APP_HREF}>{CTA_LABEL}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#how">See how it works</a>
          </Button>
        </div>
      </section>

      <section id="why" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
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
        <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-6 md:grid-cols-4">
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

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-2xl border bg-muted/30 p-8 md:p-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            Replace Lovable + Cursor + Linear
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            One surface optimized for the new bottleneck:{" "}
            <span className="text-foreground">deciding fast on AI output.</span> Real-time
            multiplayer kanban, full keyboard nav, GitHub-wired tickets, BYOK so unit economics
            stay yours.
          </p>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link href={APP_HREF}>{CTA_LABEL}</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Planbooq</span>
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
    <div className="rounded-xl border bg-card p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <li className="rounded-xl border bg-card p-6">
      <div className="text-xs font-mono text-muted-foreground">0{n}</div>
      <h3 className="mt-2 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}

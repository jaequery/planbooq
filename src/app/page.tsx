import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Planbooq — pick winners, don't prompt twice",
  description:
    "The kanban for vibe coding. Every ticket spawns N AI variants in parallel — pick the winner instead of re-prompting.",
};

const APP_HREF = "/welcome";
const CTA_LABEL = "Open the app";
const DOWNLOAD_MAC_HREF = "/api/download/mac";
const DOWNLOAD_MAC_LABEL = "Download for macOS";

export default function Home(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background text-foreground">
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
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href={APP_HREF}>{CTA_LABEL}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={DOWNLOAD_MAC_HREF}>
                <AppleIcon />
                {DOWNLOAD_MAC_LABEL}
              </a>
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

function AppleIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z" />
    </svg>
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

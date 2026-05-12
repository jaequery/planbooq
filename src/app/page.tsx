import { Instrument_Serif } from "next/font/google";
import Link from "next/link";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal"],
  variable: "--font-landing-serif",
});

export const metadata = {
  title: "Planbooq — ship while it builds",
  description:
    "A kanban for vibe coders. Drop tickets, let AI agents run them in isolated worktrees, and ship — without babysitting one terminal at a time.",
};

const DOWNLOAD_HREF = "/api/download/mac";
const APP_HREF = "/welcome";

export default function Home(): React.ReactElement {
  return (
    <main
      className={`${serif.variable} min-h-screen bg-[#F4ECD8] text-[#1F2A1E] antialiased`}
      style={{ colorScheme: "light" }}
    >
      <TopNav />
      <div className="mx-auto max-w-6xl px-6 pb-20 sm:px-8">
        <Hero />
        <BoardMock />
        <Pillars />
        <HowItWorks />
        <BottomCTA />
      </div>
      <Footer />
    </main>
  );
}

function TopNav(): React.ReactElement {
  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-7 pb-2 sm:px-8 sm:pt-10">
      <div className="font-[var(--font-landing-serif)] text-base tracking-[0.18em] text-[#1F2A1E]/70 uppercase">
        Planbooq
      </div>
      <Link
        href={APP_HREF}
        className="text-[13px] font-medium tracking-wide text-[#1F2A1E]/60 transition hover:text-[#1F2A1E]"
      >
        Open the app <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function Hero(): React.ReactElement {
  return (
    <section className="mt-16 flex flex-col items-center text-center sm:mt-24">
      <h1 className="font-[var(--font-landing-serif)] max-w-3xl text-balance text-6xl leading-[1.02] tracking-tight sm:text-[88px]">
        Ship <em className="italic text-[#3A5A40]">while it builds</em>.
      </h1>
      <p className="mt-8 max-w-xl text-balance text-[17px] leading-relaxed text-[#1F2A1E]/75 sm:text-lg">
        Drop a ticket. An AI agent runs it on its own branch and worktree. Queue the next one
        instead of waiting on the last.
      </p>
      <div className="mt-10 flex flex-col items-center gap-4">
        <Link
          href={DOWNLOAD_HREF}
          aria-label="Download Planbooq for Mac"
          className="group inline-flex h-14 items-center gap-3 rounded-full bg-[#2F4A2C] px-10 text-base font-semibold tracking-wide text-[#F4ECD8] shadow-[0_2px_0_rgba(0,0,0,0.04),0_20px_40px_-12px_rgba(31,42,30,0.45)] ring-1 ring-[#1F2A1E]/10 transition will-change-transform hover:-translate-y-0.5 hover:bg-[#243B22] hover:shadow-[0_2px_0_rgba(0,0,0,0.04),0_28px_50px_-14px_rgba(31,42,30,0.55)] focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F4A2C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4ECD8] sm:h-16 sm:px-12 sm:text-lg"
        >
          <DownloadGlyph />
          Download for Mac
        </Link>
        <a
          href="#how"
          className="text-[12px] tracking-[0.12em] text-[#1F2A1E]/50 uppercase underline-offset-4 transition hover:text-[#1F2A1E] hover:underline"
        >
          See how it works
        </a>
      </div>
    </section>
  );
}

function DownloadGlyph(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform group-hover:translate-y-0.5"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m6 11 6 6 6-6" />
      <path d="M4 21h16" />
    </svg>
  );
}

function BoardMock(): React.ReactElement {
  return (
    <div
      className="relative mt-16 sm:mt-20"
      role="img"
      aria-label="Planbooq board with AI agents running multiple tickets in parallel"
    >
      <div
        aria-hidden="true"
        className="-inset-x-4 absolute inset-y-0 -z-10 rounded-[36px] bg-[#EDE2C6]/60 blur-2xl"
      />
      <div className="overflow-hidden rounded-[24px] border border-[#1F2A1E]/12 bg-[#FBF6E3] shadow-[0_1px_0_rgba(0,0,0,0.04),0_36px_90px_-30px_rgba(31,42,30,0.38)]">
        <div className="flex items-center gap-1.5 border-[#1F2A1E]/8 border-b bg-[#F4ECD8] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#1F2A1E]/15" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-[#1F2A1E]/15" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-[#1F2A1E]/15" aria-hidden="true" />
          <span className="ml-3 font-mono text-[11px] tracking-tight text-[#1F2A1E]/45">
            planbooq · acme-app · main
          </span>
          <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-[#2F4A2C]/65 uppercase">
            <span className="board-worker-dot mr-1.5 inline-block size-1.5 rounded-full bg-[#2F4A2C] align-middle" />
            4 agents running
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2 p-3 sm:gap-3 sm:p-5">
          <Column title="Backlog" count={12}>
            <Card label="design" tone="olive" />
            <Card label="bug" tone="rust" />
            <Card label="copy" tone="sand" />
          </Column>
          <Column title="Todo" count={5}>
            <Card label="ui" tone="olive" />
            <Card label="api" tone="forest" />
          </Column>
          <Column title="Building" count={4} active>
            <BuildingCard label="hero" />
            <BuildingCard label="checkout" />
            <BuildingCard label="auth" />
            <BuildingCard label="docs" />
          </Column>
          <Column title="Review" count={2}>
            <ReviewCard label="hero" />
            <ReviewCard label="checkout" />
          </Column>
          <Column title="Done" count={28}>
            <Card label="ship" tone="forest" muted />
            <Card label="ship" tone="forest" muted />
            <Card label="ship" tone="forest" muted />
          </Column>
        </div>
      </div>
    </div>
  );
}

function Column({
  title,
  count,
  active,
  children,
}: {
  title: string;
  count: number;
  active?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <div
          className={`text-[10px] font-medium tracking-[0.18em] uppercase sm:text-[11px] ${
            active ? "text-[#2F4A2C]" : "text-[#1F2A1E]/55"
          }`}
        >
          {title}
        </div>
        <div className="text-[10px] tabular-nums text-[#1F2A1E]/40 sm:text-[11px]">{count}</div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

const TONE = {
  olive: "#6E7340",
  forest: "#2F4A2C",
  sand: "#C8A55B",
  rust: "#B5644A",
} as const;

function Card({
  label,
  tone,
  muted,
}: {
  label: string;
  tone: keyof typeof TONE;
  muted?: boolean;
}): React.ReactElement {
  return (
    <div
      className={`rounded-lg border border-[#1F2A1E]/8 bg-white p-2 sm:p-2.5 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: TONE[tone] }}
          aria-hidden="true"
        />
        <span className="text-[9px] tracking-[0.08em] text-[#1F2A1E]/55 uppercase sm:text-[10px]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-[78%] rounded-full bg-[#1F2A1E]/10" />
      <div className="mt-1 h-1.5 w-[55%] rounded-full bg-[#1F2A1E]/8" />
    </div>
  );
}

function BuildingCard({ label }: { label: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-[#2F4A2C]/22 bg-white p-2 ring-1 ring-[#2F4A2C]/5 sm:p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-[#6E7340]" aria-hidden="true" />
        <span className="text-[9px] tracking-[0.08em] text-[#1F2A1E]/55 uppercase sm:text-[10px]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-[78%] rounded-full bg-[#1F2A1E]/10" />
      <div className="mt-1 h-1.5 w-[55%] rounded-full bg-[#1F2A1E]/8" />
      <div className="mt-2.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1" aria-hidden="true">
          <span className="board-worker-dot size-1.5 rounded-full bg-[#2F4A2C]" />
          <span className="font-mono text-[9px] tracking-[0.08em] text-[#2F4A2C]/75 uppercase">
            running
          </span>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ label }: { label: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-[#C8A55B]/40 bg-white p-2 sm:p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-[#C8A55B]" aria-hidden="true" />
        <span className="text-[9px] tracking-[0.08em] text-[#1F2A1E]/55 uppercase sm:text-[10px]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-[78%] rounded-full bg-[#1F2A1E]/10" />
      <div className="mt-1 h-1.5 w-[55%] rounded-full bg-[#1F2A1E]/8" />
      <div className="mt-2.5 flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] tracking-[0.08em] text-[#C8A55B]/85 uppercase">
          PR open
        </span>
        <span className="font-mono text-[9px] tracking-tight text-[#1F2A1E]/45 tabular-nums">
          +124 −38
        </span>
      </div>
    </div>
  );
}

function Pillars(): React.ReactElement {
  return (
    <section className="mt-28 sm:mt-36">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-[var(--font-landing-serif)] text-4xl tracking-tight sm:text-5xl">
          Built for throughput.
        </h2>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <Tile
          tone="olive"
          title="Run ten in parallel."
          body="Drop a backlog and every ticket starts at once — each in its own isolated worktree. Wall-clock collapses to whatever the slowest agent takes."
        />
        <Tile
          tone="forest"
          title="Isolated by default."
          body="Every ticket gets its own branch and worktree. Agents never step on each other, and main stays clean while they run."
        />
        <Tile
          tone="sky"
          title="Glance and ship."
          body="When a ticket lands in review, the PR, diff, and CI status are right there. Look once, ship, move on."
        />
      </div>
    </section>
  );
}

function Tile({
  tone,
  title,
  body,
}: {
  tone: "olive" | "forest" | "sky";
  title: string;
  body: string;
}): React.ReactElement {
  const palette = {
    olive: { bg: "#6E7340", ink: "#F4ECD8", mute: "rgba(244,236,216,0.78)" },
    forest: { bg: "#2F4A2C", ink: "#F4ECD8", mute: "rgba(244,236,216,0.78)" },
    sky: { bg: "#C9D7CB", ink: "#1F2A1E", mute: "rgba(31,42,30,0.7)" },
  }[tone];

  return (
    <article
      className="relative flex aspect-[5/6] flex-col justify-between overflow-hidden rounded-3xl p-7 sm:aspect-[4/5]"
      style={{ backgroundColor: palette.bg, color: palette.ink }}
    >
      <h3 className="font-[var(--font-landing-serif)] text-2xl leading-tight tracking-tight sm:text-3xl">
        {title}
      </h3>
      <p className="mt-6 text-[15px] leading-relaxed sm:text-base" style={{ color: palette.mute }}>
        {body}
      </p>
    </article>
  );
}

function HowItWorks(): React.ReactElement {
  return (
    <section id="how" className="mt-28 scroll-mt-20 sm:mt-36">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-[var(--font-landing-serif)] text-4xl tracking-tight sm:text-5xl">
          Four steps. Zero waiting.
        </h2>
      </div>
      <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        <Step
          n={1}
          title="Drop a ticket"
          body="Describe what you want. ⌘K palette keeps hands on the keyboard."
          glyph={<StepDrop />}
        />
        <Step
          n={2}
          title="Agent runs"
          body="The ticket spins up its own branch and worktree. Queue the next ticket instead of waiting."
          glyph={<StepFanOut />}
        />
        <Step
          n={3}
          title="Glance"
          body="Diff, PR, and CI status flow back to the card. Look once and decide — no re-prompt loop."
          glyph={<StepCompare />}
        />
        <Step
          n={4}
          title="Ship"
          body="One click opens the PR. Merge auto-completes the ticket back to the board."
          glyph={<StepShip />}
        />
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  glyph,
}: {
  n: number;
  title: string;
  body: string;
  glyph: React.ReactNode;
}): React.ReactElement {
  return (
    <li className="flex flex-col items-start">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8DFC4] text-[#2F4A2C]">
        {glyph}
      </div>
      <div className="mt-4 font-mono text-[11px] tracking-tight text-[#1F2A1E]/45 tabular-nums">
        0{n}
      </div>
      <h3 className="font-[var(--font-landing-serif)] mt-0.5 text-2xl tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1F2A1E]/70">{body}</p>
    </li>
  );
}

function StepDrop(): React.ReactElement {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="19" height="16" rx="3" />
      <path d="M3.5 10h19" />
      <path d="M9 15h8" />
    </svg>
  );
}

function StepFanOut(): React.ReactElement {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="13" r="2.5" />
      <circle cx="20" cy="6" r="2.5" />
      <circle cx="20" cy="13" r="2.5" />
      <circle cx="20" cy="20" r="2.5" />
      <path d="M8.5 13 17.5 6" />
      <path d="M8.5 13h9" />
      <path d="M8.5 13 17.5 20" />
    </svg>
  );
}

function StepCompare(): React.ReactElement {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="9" height="16" rx="2" />
      <rect x="14" y="5" width="9" height="16" rx="2" />
      <path d="M13 3v20" strokeDasharray="2 2" />
    </svg>
  );
}

function StepShip(): React.ReactElement {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 13 5 5 13-13" />
    </svg>
  );
}

function BottomCTA(): React.ReactElement {
  return (
    <section className="mt-28 sm:mt-36">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <h2 className="font-[var(--font-landing-serif)] text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          Stop watching agents. <em className="italic text-[#3A5A40]">Start shipping</em>.
        </h2>
        <p className="mt-6 max-w-xl text-balance text-[15px] leading-relaxed text-[#1F2A1E]/70">
          Real-time multiplayer kanban. Full keyboard nav. GitHub-wired tickets. BYOK so unit
          economics stay yours.
        </p>
        <Link
          href={DOWNLOAD_HREF}
          aria-label="Download Planbooq for Mac"
          className="group mt-10 inline-flex h-14 items-center gap-3 rounded-full bg-[#2F4A2C] px-10 text-base font-semibold tracking-wide text-[#F4ECD8] shadow-[0_2px_0_rgba(0,0,0,0.04),0_20px_40px_-12px_rgba(31,42,30,0.45)] ring-1 ring-[#1F2A1E]/10 transition will-change-transform hover:-translate-y-0.5 hover:bg-[#243B22] focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F4A2C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4ECD8] sm:h-16 sm:px-12 sm:text-lg"
        >
          <DownloadGlyph />
          Download for Mac
        </Link>
        <span className="mt-5 font-mono text-[11px] tracking-[0.16em] text-[#1F2A1E]/45 uppercase">
          Runs on top of your GitHub repos
        </span>
      </div>
    </section>
  );
}

function Footer(): React.ReactElement {
  return (
    <footer className="border-[#1F2A1E]/10 border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-[12px] text-[#1F2A1E]/55 sm:flex-row sm:px-8">
        <div className="font-[var(--font-landing-serif)] tracking-[0.16em] uppercase">
          © Planbooq
        </div>
        <div className="tracking-[0.14em] uppercase">Made in Southern California</div>
        <Link
          href={APP_HREF}
          className="tracking-[0.14em] uppercase transition hover:text-[#1F2A1E]"
        >
          Open the app →
        </Link>
      </div>
    </footer>
  );
}

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

const APP_HREF = "/welcome";
const APP_LABEL = "Open the app";
const DOWNLOAD_HREF = "/api/download/mac";
const DOWNLOAD_LABEL = "Download for Mac";

const INK = "#0B0E12";
const SURFACE = "#11151B";
const SURFACE_HI = "#161B22";
const HAIRLINE = "rgba(255,255,255,0.08)";
const HAIRLINE_STRONG = "rgba(255,255,255,0.14)";
const TEXT = "#ECEEF2";
const TEXT_MUTED = "rgba(236,238,242,0.62)";
const TEXT_FAINT = "rgba(236,238,242,0.42)";
const ACCENT = "#7BD389";
const ACCENT_INK = "#08110A";

export default function Home(): React.ReactElement {
  return (
    <main
      className={`${serif.variable} relative min-h-screen overflow-x-hidden antialiased`}
      style={{ backgroundColor: INK, color: TEXT, colorScheme: "dark" }}
    >
      <BackgroundGrid />
      <Header />
      <div className="relative mx-auto max-w-6xl px-6 sm:px-8">
        <Hero />
        <ProductPreview />
        <Pillars />
        <HowItWorks />
        <Quote />
        <BottomCTA />
      </div>
      <Footer />
    </main>
  );
}

function BackgroundGrid(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[860px]"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(123,211,137,0.10), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 12%, rgba(123,211,137,0.05), transparent 70%)",
        maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
      }}
    />
  );
}

function Header(): React.ReactElement {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        backgroundColor: "rgba(11,14,18,0.62)",
        borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-8">
        <div className="flex items-center gap-2">
          <Wordmark />
        </div>
        <nav className="hidden items-center gap-7 sm:flex">
          <NavLink href="#product">Product</NavLink>
          <NavLink href="#how">How it works</NavLink>
          <NavLink href="#why">Why Planbooq</NavLink>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={APP_HREF}
            className="hidden h-9 items-center rounded-lg px-3 text-[13px] font-medium transition sm:inline-flex"
            style={{ color: TEXT_MUTED }}
          >
            {APP_LABEL}
          </Link>
          <Link
            href={DOWNLOAD_HREF}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition hover:brightness-95"
            style={{ backgroundColor: ACCENT, color: ACCENT_INK }}
          >
            Download
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <a href={href} className="text-[13px] transition" style={{ color: TEXT_MUTED }}>
      {children}
    </a>
  );
}

function Wordmark(): React.ReactElement {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md"
        style={{
          backgroundColor: ACCENT,
          color: ACCENT_INK,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="1.5" y="1.5" width="4" height="11" rx="1.2" fill="currentColor" />
          <rect x="8.5" y="1.5" width="4" height="7" rx="1.2" fill="currentColor" opacity="0.65" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Planbooq</span>
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.16em] uppercase"
      style={{ borderColor: HAIRLINE_STRONG, color: TEXT_MUTED }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: ACCENT, boxShadow: "0 0 12px rgba(123,211,137,0.6)" }}
      />
      {children}
    </span>
  );
}

function Hero(): React.ReactElement {
  return (
    <section className="flex flex-col items-center pt-20 pb-10 text-center sm:pt-28 sm:pb-14">
      <Eyebrow>Kanban for vibe coders</Eyebrow>
      <h1
        className="font-[var(--font-landing-serif)] mt-6 max-w-4xl text-balance text-5xl leading-[1.02] tracking-tight sm:text-7xl"
        style={{ color: TEXT }}
      >
        Ship{" "}
        <em className="italic" style={{ color: ACCENT }}>
          while it builds
        </em>
        .
      </h1>
      <p
        className="mt-7 max-w-xl text-balance text-base leading-relaxed sm:text-[17px]"
        style={{ color: TEXT_MUTED }}
      >
        Drop a ticket. An AI agent runs it on its own branch and worktree. Queue the next one
        instead of waiting on the last.
      </p>
      <div className="mt-9 flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={DOWNLOAD_HREF}
            className="group inline-flex h-12 items-center gap-2.5 rounded-xl px-6 text-[15px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: ACCENT,
              color: ACCENT_INK,
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.25) inset, 0 12px 32px -16px rgba(123,211,137,0.55)",
            }}
            aria-label={DOWNLOAD_LABEL}
          >
            <AppleGlyph />
            {DOWNLOAD_LABEL}
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex h-12 items-center rounded-xl border px-5 text-[15px] font-medium transition"
            style={{
              borderColor: HAIRLINE_STRONG,
              color: TEXT,
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            {APP_LABEL}
            <span aria-hidden="true" className="ml-2 opacity-60">
              ↗
            </span>
          </Link>
        </div>
        <p
          className="mt-1 font-mono text-[11px] tracking-[0.16em] uppercase"
          style={{ color: TEXT_FAINT }}
        >
          Mac · BYOK · Runs on your GitHub repos
        </p>
      </div>
    </section>
  );
}

function AppleGlyph(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="transition-transform group-hover:-translate-y-0.5"
    >
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.6-2.987 1.52-.12-1.12.42-2.28 1.06-3.02.71-.81 1.94-1.4 3.104-1.58zM20.5 17.36c-.55 1.27-.81 1.84-1.52 2.96-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1.01-4.05-1-2.1.01-2.54 1.02-4.1 1-1.74-.02-3.06-1.78-4.06-3.35C.97 18.5-.2 13.79.34 11.05c.79-4 4.07-5.62 6.13-5.62 1.81 0 3.41 1.22 4.6 1.22 1.17 0 3.06-1.22 5.16-1.04.88.04 3.36.36 4.95 2.73-.13.08-2.95 1.72-2.93 5.12.03 4.05 3.54 5.41 3.58 5.43-.03.09-.55 1.93-1.83 4.47z" />
    </svg>
  );
}

function ProductPreview(): React.ReactElement {
  return (
    <section id="product" className="mt-12 sm:mt-16">
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          backgroundColor: SURFACE,
          border: `1px solid ${HAIRLINE}`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), 0 30px 80px -40px rgba(0,0,0,0.6), 0 0 0 1px rgba(123,211,137,0.04)",
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: HAIRLINE }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#3a3f49" }}
          />
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#3a3f49" }}
          />
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#3a3f49" }}
          />
          <span
            className="ml-3 font-mono text-[11px] tracking-[0.14em] uppercase"
            style={{ color: TEXT_FAINT }}
          >
            planbooq · acme · main board
          </span>
          <span
            className="ml-auto inline-flex items-center gap-2 font-mono text-[10.5px] tracking-[0.16em] uppercase"
            style={{ color: ACCENT }}
          >
            <span
              aria-hidden="true"
              className="ticket-pulse inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
            4 agents running
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5 sm:gap-4 sm:p-6">
          <KanbanColumn name="Backlog" count={12}>
            <TicketCard title="Tighten onboarding copy" />
            <TicketCard title="API key rotation" />
          </KanbanColumn>
          <KanbanColumn name="Todo" count={5}>
            <TicketCard title="Worktree GC job" />
            <TicketCard title="Cmd-K palette polish" />
          </KanbanColumn>
          <KanbanColumn name="Building" count={4} active>
            <TicketCard title="Redesign landing page" running />
            <TicketCard title="Auth provider swap" running />
            <TicketCard title="Hero copy refresh" running />
          </KanbanColumn>
          <KanbanColumn name="Review" count={2}>
            <TicketCard title="Webhook retry policy" pr="+124 −38" />
          </KanbanColumn>
          <KanbanColumn name="Done" count={28} dim>
            <TicketCard title="Workspace switcher" done />
            <TicketCard title="Ably token refresh" done />
          </KanbanColumn>
        </div>
      </div>
    </section>
  );
}

function KanbanColumn({
  name,
  count,
  active,
  dim,
  children,
}: {
  name: string;
  count: number;
  active?: boolean;
  dim?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{
        backgroundColor: active ? "rgba(123,211,137,0.05)" : "rgba(255,255,255,0.015)",
        border: `1px solid ${active ? "rgba(123,211,137,0.18)" : HAIRLINE}`,
        opacity: dim ? 0.72 : 1,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase"
          style={{ color: active ? ACCENT : TEXT_FAINT }}
        >
          {name}
        </span>
        <span className="font-mono text-[10.5px]" style={{ color: TEXT_FAINT }}>
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function TicketCard({
  title,
  running,
  pr,
  done,
}: {
  title: string;
  running?: boolean;
  pr?: string;
  done?: boolean;
}): React.ReactElement {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        backgroundColor: SURFACE_HI,
        border: `1px solid ${HAIRLINE}`,
      }}
    >
      <div className="text-[12.5px] leading-tight" style={{ color: done ? TEXT_MUTED : TEXT }}>
        {title}
      </div>
      <div className="flex items-center justify-between gap-1.5">
        {running ? (
          <span
            className="inline-flex items-center gap-1 font-mono text-[9.5px] tracking-wider uppercase"
            style={{ color: ACCENT }}
          >
            <span
              aria-hidden="true"
              className="ticket-pulse inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
            running
          </span>
        ) : pr ? (
          <>
            <span
              className="font-mono text-[9.5px] tracking-wider uppercase"
              style={{ color: "#C8A55B" }}
            >
              PR open
            </span>
            <span className="font-mono text-[9.5px] tabular-nums" style={{ color: TEXT_FAINT }}>
              {pr}
            </span>
          </>
        ) : done ? (
          <span
            className="font-mono text-[9.5px] tracking-wider uppercase"
            style={{ color: TEXT_FAINT }}
          >
            shipped
          </span>
        ) : (
          <span
            className="font-mono text-[9.5px] tracking-wider uppercase"
            style={{ color: TEXT_FAINT }}
          >
            queued
          </span>
        )}
      </div>
    </div>
  );
}

function Pillars(): React.ReactElement {
  return (
    <section id="why" className="mt-32 sm:mt-40">
      <div className="flex flex-col items-start">
        <Eyebrow>Why Planbooq</Eyebrow>
        <h2
          className="font-[var(--font-landing-serif)] mt-5 max-w-2xl text-balance text-4xl leading-tight tracking-tight sm:text-5xl"
          style={{ color: TEXT }}
        >
          Built for{" "}
          <em className="italic" style={{ color: ACCENT }}>
            throughput
          </em>
          .
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: TEXT_MUTED }}>
          One terminal, one ticket at a time is the bottleneck. Planbooq gives every ticket its own
          branch, worktree, and agent session, so you keep many tickets moving instead of
          babysitting one.
        </p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <Tile
          num="01"
          title="Run ten in parallel."
          body="Drop a backlog and every ticket starts at once — each on its own branch in its own worktree. Wall-clock collapses to whatever the slowest agent takes."
        />
        <Tile
          num="02"
          title="Isolated by default."
          body="Branch, worktree, and agent session per ticket. Agents never step on each other, and main stays clean while they run."
        />
        <Tile
          num="03"
          title="Glance and ship."
          body="When a ticket lands in review, the PR, diff, and CI status are right there. Look once, ship, move on."
        />
      </div>
    </section>
  );
}

function Tile({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <article
      className="relative flex flex-col rounded-2xl p-7"
      style={{
        backgroundColor: SURFACE,
        border: `1px solid ${HAIRLINE}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <span className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: ACCENT }}>
        {num}
      </span>
      <h3
        className="font-[var(--font-landing-serif)] mt-3 text-2xl leading-tight tracking-tight sm:text-[28px]"
        style={{ color: TEXT }}
      >
        {title}
      </h3>
      <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: TEXT_MUTED }}>
        {body}
      </p>
    </article>
  );
}

function HowItWorks(): React.ReactElement {
  return (
    <section id="how" className="mt-32 scroll-mt-20 sm:mt-40">
      <div className="flex flex-col items-start">
        <Eyebrow>How it works</Eyebrow>
        <h2
          className="font-[var(--font-landing-serif)] mt-5 max-w-2xl text-balance text-4xl leading-tight tracking-tight sm:text-5xl"
          style={{ color: TEXT }}
        >
          Four steps.{" "}
          <em className="italic" style={{ color: ACCENT }}>
            Zero waiting.
          </em>
        </h2>
      </div>
      <ol
        className="mt-12 grid gap-px overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-4"
        style={{ backgroundColor: HAIRLINE, border: `1px solid ${HAIRLINE}` }}
      >
        <Step
          n={1}
          title="Drop a ticket"
          body="Describe what you want and move on. ⌘K palette keeps your hands on the keyboard."
          glyph={<StepDrop />}
        />
        <Step
          n={2}
          title="Agent runs"
          body="The ticket spins up its own branch and worktree, and an agent runs it end-to-end. You queue the next one."
          glyph={<StepAgent />}
        />
        <Step
          n={3}
          title="Glance"
          body="Diff, PR, and CI status flow back to the card. Look once and decide — no re-prompt loop."
          glyph={<StepGlance />}
        />
        <Step
          n={4}
          title="Ship"
          body="One click opens the PR and clears the lane. Merge auto-completes the ticket back to the board."
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
    <li className="flex flex-col gap-4 p-7" style={{ backgroundColor: SURFACE }}>
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{
          backgroundColor: "rgba(123,211,137,0.10)",
          color: ACCENT,
          border: `1px solid rgba(123,211,137,0.22)`,
        }}
      >
        {glyph}
      </div>
      <div>
        <span
          className="font-mono text-[11px] tracking-[0.22em] uppercase"
          style={{ color: TEXT_FAINT }}
        >
          Step 0{n}
        </span>
        <h3
          className="font-[var(--font-landing-serif)] mt-1.5 text-xl tracking-tight"
          style={{ color: TEXT }}
        >
          {title}
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: TEXT_MUTED }}>
          {body}
        </p>
      </div>
    </li>
  );
}

function StepDrop(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
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

function StepAgent(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h6l3-4h9" />
      <path d="M4 13h12" />
      <path d="M4 18h6l3 4h9" />
      <circle cx="20" cy="13" r="2" />
    </svg>
  );
}

function StepGlance(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="20" height="16" rx="2" />
      <path d="M3 10h20" />
      <path d="M8 15h6" />
      <path d="M8 18h10" />
    </svg>
  );
}

function StepShip(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
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

function Quote(): React.ReactElement {
  return (
    <section className="mt-32 sm:mt-40">
      <div
        className="relative mx-auto max-w-4xl rounded-2xl p-10 sm:p-14"
        style={{
          backgroundColor: SURFACE,
          border: `1px solid ${HAIRLINE}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <svg
          aria-hidden="true"
          width="40"
          height="32"
          viewBox="0 0 40 32"
          className="opacity-30"
          style={{ color: ACCENT }}
        >
          <path
            fill="currentColor"
            d="M8 0C3.6 0 0 3.6 0 8v12c0 6.6 5.4 12 12 12v-8c-2.2 0-4-1.8-4-4h4V8H8zm20 0c-4.4 0-8 3.6-8 8v12c0 6.6 5.4 12 12 12v-8c-2.2 0-4-1.8-4-4h4V8h-4z"
          />
        </svg>
        <blockquote
          className="font-[var(--font-landing-serif)] mt-6 text-[28px] leading-snug tracking-tight sm:text-4xl"
          style={{ color: TEXT }}
        >
          The point of AI was supposed to be that humans stop waiting. Planbooq is the first tool
          where I actually don't.
        </blockquote>
        <footer
          className="mt-8 flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] uppercase"
          style={{ color: TEXT_FAINT }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-px w-8"
            style={{ backgroundColor: HAIRLINE_STRONG }}
          />
          A vibe coder, beta cohort
        </footer>
      </div>
    </section>
  );
}

function BottomCTA(): React.ReactElement {
  return (
    <section className="mt-32 mb-24 sm:mt-40">
      <div
        className="relative overflow-hidden rounded-3xl p-10 text-center sm:p-16"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 0%, rgba(123,211,137,0.10), transparent 70%), linear-gradient(180deg, #11151B 0%, #0E1217 100%)",
          border: `1px solid ${HAIRLINE}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <h2
          className="font-[var(--font-landing-serif)] mx-auto max-w-3xl text-balance text-4xl leading-tight tracking-tight sm:text-6xl"
          style={{ color: TEXT }}
        >
          Stop watching agents.{" "}
          <em className="italic" style={{ color: ACCENT }}>
            Start shipping.
          </em>
        </h2>
        <p
          className="mx-auto mt-6 max-w-xl text-balance text-[15px] leading-relaxed"
          style={{ color: TEXT_MUTED }}
        >
          Real-time multiplayer kanban. Full keyboard nav. GitHub-wired tickets. BYOK so unit
          economics stay yours.
        </p>

        <PromptBar />

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={DOWNLOAD_HREF}
            className="group inline-flex h-12 items-center gap-2.5 rounded-xl px-6 text-[15px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: ACCENT,
              color: ACCENT_INK,
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.25) inset, 0 12px 32px -16px rgba(123,211,137,0.55)",
            }}
          >
            <AppleGlyph />
            {DOWNLOAD_LABEL}
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex h-12 items-center rounded-xl border px-5 text-[15px] font-medium transition"
            style={{
              borderColor: HAIRLINE_STRONG,
              color: TEXT,
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            {APP_LABEL}
          </Link>
        </div>
      </div>
    </section>
  );
}

function PromptBar(): React.ReactElement {
  return (
    <div className="mx-auto mt-10 w-full max-w-2xl">
      <div
        className="rounded-2xl p-2.5"
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: `1px solid ${HAIRLINE_STRONG}`,
        }}
      >
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: SURFACE_HI }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_FAINT}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 text-left text-[14px]" style={{ color: TEXT_FAINT }}>
            Add a ticket — "Refresh the hero copy and swap the CTA…"
          </span>
          <span
            className="rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]"
            style={{ borderColor: HAIRLINE_STRONG, color: TEXT_FAINT }}
          >
            ⌘K
          </span>
        </div>
        <div
          className="mt-2 flex items-center justify-between px-2 pt-1 pb-1 font-mono text-[10px] tracking-[0.18em] uppercase"
          style={{ color: TEXT_FAINT }}
        >
          <span>Agent runs on its own branch</span>
          <span>You move on</span>
        </div>
      </div>
    </div>
  );
}

function Footer(): React.ReactElement {
  return (
    <footer className="mt-10 border-t" style={{ borderColor: HAIRLINE }}>
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center sm:px-8">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span
            className="font-mono text-[11px] tracking-[0.16em] uppercase"
            style={{ color: TEXT_FAINT }}
          >
            Made in Southern California
          </span>
        </div>
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]"
          style={{ color: TEXT_MUTED }}
        >
          <a href="https://github.com/planbooq">GitHub</a>
          <a href="/welcome">App</a>
          <a href="#how">How it works</a>
          <a href="#why">Why</a>
          <span style={{ color: TEXT_FAINT }}>© Planbooq 2026</span>
        </div>
      </div>
    </footer>
  );
}

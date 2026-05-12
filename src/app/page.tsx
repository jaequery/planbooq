import Link from "next/link";
import { MarketingThemeToggle } from "./(marketing)/_components/theme-toggle";

export const metadata = {
  title: "Planbooq — ship while it builds",
  description:
    "A kanban for vibe coders. Drop tickets, let AI agents run them in isolated worktrees, and ship — without babysitting one terminal at a time.",
};

const APP_HREF = "/welcome";
const APP_LABEL = "Open the app";
const DOWNLOAD_HREF = "/api/download/mac";
const DOWNLOAD_LABEL = "Download for Mac";

export default function Home(): React.ReactElement {
  return (
    <main
      className="marketing relative min-h-screen overflow-x-hidden antialiased"
      style={{ backgroundColor: "var(--mk-bg)", color: "var(--mk-ink)" }}
    >
      <BackgroundGrid />
      <Header />
      <div className="relative mx-auto max-w-7xl px-6 sm:px-8">
        <Hero />
        <ProductPreview />
        <LogoStrip />
        <Features />
        <HowItWorks />
        <Testimonial />
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
      className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[720px]"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--mk-hairline) 1px, transparent 1px), linear-gradient(to bottom, var(--mk-hairline) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black, transparent 70%)",
        WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black, transparent 70%)",
      }}
    />
  );
}

function Header(): React.ReactElement {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        backgroundColor: "color-mix(in srgb, var(--mk-bg) 85%, transparent)",
        borderBottom: "1px solid var(--mk-hairline)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8">
        <Wordmark />
        <nav className="hidden items-center gap-7 md:flex">
          <NavLink href="#product">Product</NavLink>
          <NavLink href="#why">Customers</NavLink>
          <NavLink href={APP_HREF}>App</NavLink>
          <NavLink href="#how">Docs</NavLink>
          <NavLink href="#cta">Changelog</NavLink>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/planbooq"
            aria-label="GitHub"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition"
            style={{ color: "var(--mk-muted)" }}
          >
            <GitHubGlyph />
          </a>
          <Link
            href={APP_HREF}
            className="hidden h-9 items-center rounded-lg px-3 text-[13px] font-medium transition sm:inline-flex"
            style={{ color: "var(--mk-ink)" }}
          >
            Sign in
          </Link>
          <Link
            href={DOWNLOAD_HREF}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: "var(--mk-ink)",
              color: "var(--mk-bg)",
            }}
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
    <a
      href={href}
      className="text-[13.5px] font-medium transition hover:opacity-80"
      style={{ color: "var(--mk-muted)" }}
    >
      {children}
    </a>
  );
}

function Wordmark(): React.ReactElement {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md"
        style={{ backgroundColor: "var(--mk-ink)", color: "var(--mk-bg)" }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="1.5" y="1.5" width="4" height="11" rx="1.2" fill="currentColor" />
          <rect x="8.5" y="1.5" width="4" height="7" rx="1.2" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      <span className="text-[15.5px] font-semibold tracking-tight">Planbooq</span>
    </Link>
  );
}

function Hero(): React.ReactElement {
  return (
    <section className="flex flex-col items-center pt-24 pb-12 text-center sm:pt-32 sm:pb-16">
      <span
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
        style={{
          backgroundColor: "var(--mk-surface)",
          border: "1px solid var(--mk-hairline)",
          color: "var(--mk-muted)",
        }}
      >
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
          style={{
            backgroundColor: "var(--mk-accent-soft)",
            color: "var(--mk-accent)",
          }}
        >
          NEW
        </span>
        v1.4 · Real-time multiplayer kanban
      </span>
      <h1
        className="mt-6 max-w-4xl text-balance text-5xl font-[650] leading-[1.02] tracking-[-0.035em] sm:text-7xl"
        style={{ color: "var(--mk-ink)" }}
      >
        Ship <span style={{ color: "var(--mk-accent)" }}>while it builds</span>.
      </h1>
      <p
        className="mt-6 max-w-xl text-balance text-[17px] leading-relaxed sm:text-lg"
        style={{ color: "var(--mk-muted)" }}
      >
        Drop a ticket. An AI agent runs it on its own branch and worktree. Queue the next one
        instead of waiting on the last.
      </p>
      <div className="mt-9 flex flex-col items-center gap-5">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href={DOWNLOAD_HREF}
            className="group inline-flex h-12 items-center gap-2.5 rounded-[10px] px-6 text-[15px] font-semibold transition hover:brightness-95"
            style={{ backgroundColor: "var(--mk-ink)", color: "var(--mk-bg)" }}
            aria-label={DOWNLOAD_LABEL}
          >
            <AppleGlyph />
            {DOWNLOAD_LABEL}
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex h-12 items-center rounded-[10px] px-5 text-[15px] font-medium transition"
            style={{
              border: "1px solid var(--mk-hairline-strong)",
              color: "var(--mk-ink)",
              backgroundColor: "var(--mk-bg)",
            }}
          >
            {APP_LABEL}
            <span aria-hidden="true" className="ml-2 opacity-60">
              →
            </span>
          </Link>
        </div>
        <p
          className="font-mono text-[11px] tracking-[0.08em] uppercase"
          style={{ color: "var(--mk-faint)" }}
        >
          Mac · Bring your own key · Runs on your GitHub repos
        </p>
      </div>
    </section>
  );
}

function AppleGlyph(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="transition-transform group-hover:-translate-y-0.5"
    >
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.6-2.987 1.52-.12-1.12.42-2.28 1.06-3.02.71-.81 1.94-1.4 3.104-1.58zM20.5 17.36c-.55 1.27-.81 1.84-1.52 2.96-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1.01-4.05-1-2.1.01-2.54 1.02-4.1 1-1.74-.02-3.06-1.78-4.06-3.35C.97 18.5-.2 13.79.34 11.05c.79-4 4.07-5.62 6.13-5.62 1.81 0 3.41 1.22 4.6 1.22 1.17 0 3.06-1.22 5.16-1.04.88.04 3.36.36 4.95 2.73-.13.08-2.95 1.72-2.93 5.12.03 4.05 3.54 5.41 3.58 5.43-.03.09-.55 1.93-1.83 4.47z" />
    </svg>
  );
}

function GitHubGlyph(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.43-2.69 5.4-5.25 5.69.41.35.78 1.04.78 2.1v3.11c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function ProductPreview(): React.ReactElement {
  return (
    <section id="product" className="mt-16 sm:mt-20">
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          backgroundColor: "var(--mk-bg)",
          border: "1px solid var(--mk-hairline)",
          boxShadow:
            "0 1px 1px rgba(0,0,0,0.02), 0 12px 36px -16px rgba(0,0,0,0.10), 0 32px 72px -32px rgba(0,0,0,0.10)",
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{
            borderColor: "var(--mk-hairline)",
            backgroundColor: "var(--mk-surface)",
          }}
        >
          <ChromeDot />
          <ChromeDot />
          <ChromeDot />
          <span
            className="ml-3 inline-flex items-center gap-2 rounded-md px-2.5 py-1 font-mono text-[11px]"
            style={{
              border: "1px solid var(--mk-hairline)",
              backgroundColor: "var(--mk-bg)",
              color: "var(--mk-faint)",
            }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--mk-accent)" }}
            />
            planbooq.app / acme / main board
          </span>
          <span
            className="ml-auto inline-flex items-center gap-2 font-mono text-[11px] font-semibold"
            style={{ color: "var(--mk-accent)" }}
          >
            <span
              aria-hidden="true"
              className="ticket-pulse inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--mk-accent)" }}
            />
            4 agents running
          </span>
        </div>
        <div
          className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5 sm:gap-4 sm:p-6"
          style={{ backgroundColor: "var(--mk-surface)" }}
        >
          <KanbanColumn name="Backlog" count={12}>
            <TicketCard title="Tighten onboarding copy" />
            <TicketCard title="API key rotation" />
            <TicketCard title="Add Stripe webhook retry" />
          </KanbanColumn>
          <KanbanColumn name="Todo" count={5}>
            <TicketCard title="Worktree GC job" />
            <TicketCard title="Cmd-K palette polish" />
          </KanbanColumn>
          <KanbanColumn name="Building" count={4} active>
            <TicketCard title="Redesign landing page" running elapsed="0:42" />
            <TicketCard title="Auth provider swap" running elapsed="2:11" />
            <TicketCard title="Hero copy refresh" running elapsed="0:08" />
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

function ChromeDot(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: "var(--mk-hairline-strong)" }}
    />
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
      className="flex min-h-[280px] flex-col gap-2 rounded-xl p-3"
      style={{
        backgroundColor: active ? "var(--mk-accent-soft)" : "var(--mk-bg)",
        border: `1px solid ${active ? "color-mix(in srgb, var(--mk-accent) 30%, transparent)" : "var(--mk-hairline)"}`,
        opacity: dim ? 0.72 : 1,
      }}
    >
      <div className="flex items-center justify-between px-1 pt-0.5 pb-1">
        <span
          className="font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
          style={{ color: active ? "var(--mk-accent)" : "var(--mk-faint)" }}
        >
          {name}
        </span>
        <span className="font-mono text-[10.5px]" style={{ color: "var(--mk-faint)" }}>
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
  elapsed,
}: {
  title: string;
  running?: boolean;
  pr?: string;
  done?: boolean;
  elapsed?: string;
}): React.ReactElement {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2.5"
      style={{
        backgroundColor: "var(--mk-bg)",
        border: "1px solid var(--mk-hairline)",
        boxShadow: "0 1px 1px rgba(0,0,0,0.02)",
        opacity: done ? 0.65 : 1,
      }}
    >
      <div className="text-[12.5px] leading-tight font-medium" style={{ color: "var(--mk-ink)" }}>
        {title}
      </div>
      <div className="flex items-center justify-between gap-1.5">
        {running ? (
          <>
            <span
              className="inline-flex items-center gap-1 font-mono text-[9.5px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--mk-accent)" }}
            >
              <span
                aria-hidden="true"
                className="ticket-pulse inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--mk-accent)" }}
              />
              running
            </span>
            {elapsed ? (
              <span
                className="font-mono text-[9.5px] tabular-nums"
                style={{ color: "var(--mk-faint)" }}
              >
                {elapsed}
              </span>
            ) : null}
          </>
        ) : pr ? (
          <>
            <span
              className="font-mono text-[9.5px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--mk-warn)" }}
            >
              PR open
            </span>
            <span
              className="font-mono text-[9.5px] tabular-nums"
              style={{ color: "var(--mk-faint)" }}
            >
              {pr}
            </span>
          </>
        ) : done ? (
          <span
            className="font-mono text-[9.5px] tracking-wider uppercase"
            style={{ color: "var(--mk-faint)" }}
          >
            shipped
          </span>
        ) : (
          <span
            className="font-mono text-[9.5px] tracking-wider uppercase"
            style={{ color: "var(--mk-faint)" }}
          >
            queued
          </span>
        )}
      </div>
    </div>
  );
}

function LogoStrip(): React.ReactElement {
  const logos: { name: string; mark: string }[] = [
    { name: "Vector", mark: "▲" },
    { name: "Northwind", mark: "◆" },
    { name: "Halftone", mark: "◐" },
    { name: "Mesh", mark: "⬡" },
    { name: "Wavelength", mark: "∿" },
    { name: "Quartz", mark: "◇" },
  ];
  return (
    <section className="mt-20 text-center">
      <p
        className="font-mono text-[11px] tracking-[0.16em] uppercase"
        style={{ color: "var(--mk-faint)" }}
      >
        Trusted by teams shipping with agents
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-14 gap-y-4">
        {logos.map((l) => (
          <span
            key={l.name}
            className="inline-flex items-center gap-2 text-[18px] font-[650] tracking-tight"
            style={{ color: "var(--mk-faint)", opacity: 0.7 }}
          >
            <span aria-hidden="true">{l.mark}</span>
            {l.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function Features(): React.ReactElement {
  return (
    <section id="why" className="mt-28 scroll-mt-20 sm:mt-36">
      <div className="flex flex-col items-start">
        <SectionEyebrow>WHY PLANBOOQ</SectionEyebrow>
        <h2
          className="mt-3 max-w-2xl text-balance text-4xl font-[650] leading-[1.08] tracking-[-0.028em] sm:text-[44px]"
          style={{ color: "var(--mk-ink)" }}
        >
          Built for throughput, not babysitting.
        </h2>
        <p
          className="mt-4 max-w-xl text-[16.5px] leading-relaxed"
          style={{ color: "var(--mk-muted)" }}
        >
          One terminal, one ticket at a time is the bottleneck. Planbooq gives every ticket its own
          branch, worktree, and agent so you keep many tickets moving at once.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-3">
        <FeatureCard
          icon={<IconParallel />}
          title="Run ten in parallel."
          body="Drop a backlog and every ticket starts at once — each on its own branch in its own worktree. Wall-clock collapses to whatever the slowest agent takes."
        />
        <FeatureCard
          icon={<IconShield />}
          title="Isolated by default."
          body="Branch, worktree, and agent session per ticket. Agents never step on each other, and main stays clean while they run."
        />
        <FeatureCard
          icon={<IconBolt />}
          title="Glance and ship."
          body="When a ticket lands in review, the PR, diff, and CI status are right there. Look once, ship, move on."
        />
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <article
      className="flex flex-col rounded-2xl p-7"
      style={{
        backgroundColor: "var(--mk-bg)",
        border: "1px solid var(--mk-hairline)",
      }}
    >
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px]"
        style={{
          backgroundColor: "var(--mk-surface)",
          border: "1px solid var(--mk-hairline)",
          color: "var(--mk-ink)",
        }}
      >
        {icon}
      </span>
      <h3
        className="mt-5 text-[19px] font-semibold tracking-[-0.012em]"
        style={{ color: "var(--mk-ink)" }}
      >
        {title}
      </h3>
      <p className="mt-2 text-[14.5px] leading-[1.6]" style={{ color: "var(--mk-muted)" }}>
        {body}
      </p>
    </article>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      className="font-mono text-[11px] font-semibold tracking-[0.16em] uppercase"
      style={{ color: "var(--mk-accent)" }}
    >
      {children}
    </span>
  );
}

function HowItWorks(): React.ReactElement {
  return (
    <section id="how" className="mt-28 scroll-mt-20 sm:mt-36">
      <div className="flex flex-col items-start">
        <SectionEyebrow>HOW IT WORKS</SectionEyebrow>
        <h2
          className="mt-3 max-w-2xl text-balance text-4xl font-[650] leading-[1.08] tracking-[-0.028em] sm:text-[44px]"
          style={{ color: "var(--mk-ink)" }}
        >
          Four steps. Zero waiting.
        </h2>
      </div>
      <ol
        className="mt-12 grid gap-px overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-4"
        style={{
          backgroundColor: "var(--mk-hairline)",
          border: "1px solid var(--mk-hairline)",
        }}
      >
        <Step
          n={1}
          title="Drop a ticket"
          body="Describe what you want and move on. ⌘K keeps your hands on the keyboard."
          glyph={<StepDrop />}
        />
        <Step
          n={2}
          title="Agent runs"
          body="The ticket spins up its own branch and worktree, and an agent runs it end-to-end."
          glyph={<StepAgent />}
        />
        <Step
          n={3}
          title="Glance"
          body="Diff, PR, and CI status flow back to the card. Look once and decide."
          glyph={<StepGlance />}
        />
        <Step
          n={4}
          title="Ship"
          body="One click opens the PR and clears the lane. Merge auto-completes the ticket."
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
    <li className="flex flex-col gap-4 p-7" style={{ backgroundColor: "var(--mk-bg)" }}>
      <div
        className="flex h-10 w-10 items-center justify-center rounded-[10px]"
        style={{
          backgroundColor: "var(--mk-surface)",
          border: "1px solid var(--mk-hairline)",
          color: "var(--mk-ink)",
        }}
      >
        {glyph}
      </div>
      <div>
        <span
          className="font-mono text-[11px] font-semibold tracking-[0.18em] uppercase"
          style={{ color: "var(--mk-faint)" }}
        >
          Step 0{n}
        </span>
        <h3
          className="mt-1.5 text-[18px] font-semibold tracking-[-0.012em]"
          style={{ color: "var(--mk-ink)" }}
        >
          {title}
        </h3>
        <p className="mt-2 text-[14px] leading-[1.55]" style={{ color: "var(--mk-muted)" }}>
          {body}
        </p>
      </div>
    </li>
  );
}

function StepDrop(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 14h8" />
    </svg>
  );
}

function StepAgent(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="6" height="14" rx="1.5" />
      <rect x="15" y="4" width="6" height="8" rx="1.5" />
      <rect x="9" y="12" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function StepGlance(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function StepShip(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function IconParallel(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="6" height="16" rx="1.5" />
      <rect x="15" y="4" width="6" height="9" rx="1.5" />
      <rect x="9" y="13" width="6" height="7" rx="1.5" />
    </svg>
  );
}

function IconShield(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z" />
    </svg>
  );
}

function IconBolt(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m13 2-9 13h7l-1 7 9-13h-7l1-7z" />
    </svg>
  );
}

function Testimonial(): React.ReactElement {
  return (
    <section className="mt-28 sm:mt-36">
      <div
        className="relative mx-auto max-w-4xl rounded-3xl p-10 sm:p-14"
        style={{
          backgroundColor: "var(--mk-surface)",
          border: "1px solid var(--mk-hairline)",
        }}
      >
        <svg
          aria-hidden="true"
          width="36"
          height="28"
          viewBox="0 0 40 32"
          style={{ color: "var(--mk-accent)", opacity: 0.4 }}
        >
          <path
            fill="currentColor"
            d="M8 0C3.6 0 0 3.6 0 8v12c0 6.6 5.4 12 12 12v-8c-2.2 0-4-1.8-4-4h4V8H8zm20 0c-4.4 0-8 3.6-8 8v12c0 6.6 5.4 12 12 12v-8c-2.2 0-4-1.8-4-4h4V8h-4z"
          />
        </svg>
        <blockquote
          className="mt-6 text-balance text-[24px] leading-[1.35] font-medium tracking-[-0.018em] sm:text-[28px]"
          style={{ color: "var(--mk-ink)" }}
        >
          The point of AI was supposed to be that humans stop waiting. Planbooq is the first tool
          where I actually don't — I keep five tickets in flight and ship two a day.
        </blockquote>
        <footer className="mt-8 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #d4d4d8, #71717a)",
            }}
          >
            EM
          </span>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold" style={{ color: "var(--mk-ink)" }}>
              Eliza Moreno
            </span>
            <span className="text-[13px]" style={{ color: "var(--mk-muted)" }}>
              Founding engineer · Quartz
            </span>
          </div>
        </footer>
      </div>
    </section>
  );
}

function BottomCTA(): React.ReactElement {
  return (
    <section id="cta" className="mt-28 mb-28 sm:mt-36">
      <div
        className="relative overflow-hidden rounded-3xl p-10 text-center sm:p-16"
        style={{
          backgroundColor: "var(--mk-cta-bg)",
          color: "var(--mk-cta-ink)",
          border: "1px solid var(--mk-hairline)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[260px]"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in srgb, var(--mk-accent) 22%, transparent), transparent 70%)",
          }}
        />
        <h2 className="relative mx-auto max-w-3xl text-balance text-4xl font-[650] leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
          Stop watching agents. <span style={{ color: "var(--mk-accent)" }}>Start shipping.</span>
        </h2>
        <p
          className="relative mx-auto mt-5 max-w-xl text-balance text-[16.5px] leading-relaxed"
          style={{ color: "color-mix(in srgb, var(--mk-cta-ink) 66%, transparent)" }}
        >
          Real-time multiplayer kanban. Full keyboard nav. GitHub-wired tickets. BYOK so unit
          economics stay yours.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href={DOWNLOAD_HREF}
            className="group inline-flex h-12 items-center gap-2.5 rounded-[10px] px-6 text-[15px] font-semibold transition hover:brightness-95"
            style={{
              backgroundColor: "var(--mk-cta-ink)",
              color: "var(--mk-cta-bg)",
            }}
          >
            <AppleGlyph />
            {DOWNLOAD_LABEL}
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex h-12 items-center rounded-[10px] px-5 text-[15px] font-medium transition"
            style={{
              border: "1px solid color-mix(in srgb, var(--mk-cta-ink) 18%, transparent)",
              color: "var(--mk-cta-ink)",
            }}
          >
            {APP_LABEL}
            <span aria-hidden="true" className="ml-2 opacity-60">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer(): React.ReactElement {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--mk-hairline)",
        backgroundColor: "var(--mk-surface)",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-10 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p
              className="max-w-[280px] text-[13.5px] leading-[1.55]"
              style={{ color: "var(--mk-muted)" }}
            >
              The kanban for vibe coders. Branch, worktree, and AI agent per ticket — so you ship
              while it builds.
            </p>
            <div className="flex gap-1">
              <FooterIconLink href="https://github.com/planbooq" label="GitHub">
                <GitHubGlyph />
              </FooterIconLink>
              <FooterIconLink href="#" label="X">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M18 2h3l-7 8 8 12h-6l-5-7-6 7H2l8-9L2 2h6l4 6 6-6z" />
                </svg>
              </FooterIconLink>
            </div>
          </div>
          <FooterColumn
            heading="Product"
            links={[
              { label: "Features", href: "#why" },
              { label: "Pricing", href: "#" },
              { label: "Changelog", href: "#" },
              { label: "Roadmap", href: "#" },
              { label: "Download", href: DOWNLOAD_HREF },
            ]}
          />
          <FooterColumn
            heading="Resources"
            links={[
              { label: "Docs", href: "#" },
              { label: "Guides", href: "#" },
              { label: "API", href: "/docs/api" },
              { label: "Status", href: "#" },
              { label: "Brand", href: "#" },
            ]}
          />
          <FooterColumn
            heading="Company"
            links={[
              { label: "About", href: "#" },
              { label: "Blog", href: "#" },
              { label: "Customers", href: "#why" },
              { label: "Careers", href: "#" },
              { label: "Contact", href: "#" },
            ]}
          />
          <FooterColumn
            heading="Legal"
            links={[
              { label: "Privacy", href: "#" },
              { label: "Terms", href: "#" },
              { label: "Security", href: "#" },
              { label: "DPA", href: "#" },
              { label: "Acceptable use", href: "#" },
            ]}
          />
        </div>
        <div
          className="mt-14 flex flex-col items-start justify-between gap-4 pt-6 sm:flex-row sm:items-center"
          style={{ borderTop: "1px solid var(--mk-hairline)" }}
        >
          <span className="text-[12.5px]" style={{ color: "var(--mk-faint)" }}>
            © Planbooq 2026 · Made in Southern California
          </span>
          <MarketingThemeToggle />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string }[];
}): React.ReactElement {
  return (
    <div className="flex flex-col">
      <h5
        className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase"
        style={{ color: "var(--mk-faint)" }}
      >
        {heading}
      </h5>
      <ul className="flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              className="text-[13.5px] transition hover:opacity-80"
              style={{ color: "var(--mk-ink-2)" }}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <a
      href={href}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition"
      style={{ color: "var(--mk-muted)" }}
    >
      {children}
    </a>
  );
}

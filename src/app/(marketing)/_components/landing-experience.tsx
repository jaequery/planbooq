"use client";

import Link from "next/link";
import { useState } from "react";
import {
  GradientCard,
  LogoMark,
  MockAgent,
  MockBoard,
  MockChart,
  Orb,
  SafetyIcon,
} from "./landing-graphics";
import { APP_HREF, ChevronIcon, DOWNLOAD_HREF, Footer, PrimaryCta } from "./landing-parts";
import { Header } from "./marketing-header";

type Surface = "plan" | "run" | "ship";

const SURFACE_COPY: Record<Surface, { label: string; tag: string; sublabel: string }> = {
  plan: {
    label: "Plan",
    tag: "Planbooq · Plan",
    sublabel: "Backlog and todo lanes, with AI suggestions baked in.",
  },
  run: {
    label: "Run",
    tag: "Planbooq · Run",
    sublabel: "Each ticket gets its own branch, worktree, and agent session.",
  },
  ship: {
    label: "Ship",
    tag: "Planbooq · Ship",
    sublabel: "Glance at the diff and the PR. Merge auto-completes the ticket.",
  },
};

export function LandingExperience(): React.ReactElement {
  return (
    <>
      <Header />
      <Hero />
      <LogoWall />
      <TwoSurfaces />
      <PlanFeature />
      <ShipFeature />
      <ApiSection />
      <ResearchSection />
      <SafetySection />
      <LatestUpdates />
      <FinalCta />
      <Footer />
    </>
  );
}

/* ---------------------------------------------------------------- Hero -- */

function Hero(): React.ReactElement {
  const [surface, setSurface] = useState<Surface>("run");
  const tabs: Surface[] = ["plan", "run", "ship"];
  return (
    <section className="mx-auto max-w-7xl px-6 pt-14 pb-10 lg:px-10 lg:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_auto]">
        <div className="max-w-2xl">
          <h1 className="text-balance text-[44px] font-semibold leading-[1.04] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[58px]">
            Shipping at the speed
            <br />
            of parallel AI.
          </h1>
          <p className="mt-7 max-w-xl text-[16.5px] leading-relaxed text-[var(--mk-muted)]">
            The bottleneck has moved from writing code to running, reviewing, and shipping it.
            Planbooq gives every ticket its own branch, worktree, and AI worker — so one human can
            keep ten tickets moving instead of babysitting one terminal.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <PrimaryCta href={APP_HREF} className="!h-11 !px-6 !text-[14px]">
              Sign up
            </PrimaryCta>
            <Link
              href="mailto:hello@planbooq.app"
              className="inline-flex h-11 items-center rounded-full px-5 text-[14px] font-medium text-[var(--mk-ink)] transition hover:bg-[var(--mk-surface)]"
            >
              Contact sales
            </Link>
          </div>
        </div>
      </div>

      {/* Hero showcase panel */}
      <div className="mt-12 overflow-hidden rounded-[28px] bg-[var(--mk-panel)] p-6 sm:p-10 lg:p-12">
        {/* Tab strip */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full bg-[var(--mk-bg)]/70 p-1 shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-[var(--mk-hairline)] backdrop-blur">
            {tabs.map((id) => {
              const active = surface === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSurface(id)}
                  className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition ${
                    active
                      ? "bg-[var(--mk-ink)] text-[var(--mk-bg)]"
                      : "text-[var(--mk-muted)] hover:text-[var(--mk-ink)]"
                  }`}
                >
                  Planbooq {SURFACE_COPY[id].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Three orbs */}
        <div className="mt-14 mb-10 flex items-end justify-center gap-10 sm:gap-16">
          {tabs.map((id) => {
            const isActive = surface === id;
            return (
              <Orb
                key={id}
                variant={id}
                size={isActive ? 240 : 170}
                active={isActive}
                label={SURFACE_COPY[id].tag}
                sublabel={isActive ? SURFACE_COPY[id].sublabel : undefined}
              />
            );
          })}
        </div>

        {/* Tags */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--mk-hairline)] pt-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-[var(--mk-muted)]">
            {["Worktrees", "Per-ticket branches", "Live agent sessions", "GitHub PRs", "BYOK"].map(
              (tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mk-bg)]/60 px-3 py-1.5 ring-1 ring-[var(--mk-hairline)]"
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-[var(--mk-faint)]" />
                  {tag}
                </span>
              ),
            )}
          </div>
          <Link
            href={APP_HREF}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--mk-ink)] px-5 py-2 text-[13px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
          >
            Sign up
            <ChevronIcon className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Logo wall -- */

function LogoWall(): React.ReactElement {
  const logos: { label: string; shape: "circle" | "square" | "triangle" | "slash" }[] = [
    { label: "Northwind", shape: "circle" },
    { label: "Lumen", shape: "square" },
    { label: "Stripe.io", shape: "slash" },
    { label: "Vanta", shape: "triangle" },
    { label: "Helios", shape: "circle" },
    { label: "Mercato", shape: "slash" },
    { label: "Bloom", shape: "circle" },
    { label: "Quanta", shape: "square" },
    { label: "Forge", shape: "triangle" },
    { label: "Anvil", shape: "slash" },
    { label: "Pylon", shape: "circle" },
    { label: "Drift", shape: "square" },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 pt-2 pb-20 lg:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-[14px] text-[var(--mk-muted)]">
          Trusted by builders shipping with AI day in, day out.
        </p>
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-[13.5px] font-medium text-[var(--mk-ink)] hover:opacity-70"
        >
          Read all stories
          <ChevronIcon className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {logos.map((l) => (
          <LogoMark key={l.label} label={l.label} shape={l.shape} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Two surfaces -- */

function TwoSurfaces(): React.ReactElement {
  return (
    <section id="platform" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20 lg:px-10 lg:py-28">
      <h2 className="max-w-2xl text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[40px]">
        Two surfaces built on the
        <br />
        same ticket pipeline.
      </h2>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Board"
          title="A kanban that maps to your branches and PRs."
          body="Backlog → todo → building → review → completed. Each card carries a branch, a PR, and a live status."
        >
          <MockBoard className="w-full" />
        </SurfaceCard>
        <SurfaceCard
          eyebrow="Worker"
          title="Each ticket gets its own AI agent session."
          body="Move a ticket into Building and Planbooq spins up a worktree, a branch, and a Claude session — wired to your keys."
        >
          <MockAgent className="w-full" />
        </SurfaceCard>
      </div>
    </section>
  );
}

function SurfaceCard({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--mk-panel)] p-6 lg:p-8">
      <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--mk-faint)] uppercase">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-[20px] font-semibold tracking-tight text-[var(--mk-ink)]">
        {title}
      </h3>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[var(--mk-muted)]">{body}</p>
      <div className="mt-7 overflow-hidden rounded-xl ring-1 ring-[var(--mk-hairline)]">
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Plan feature -- */

function PlanFeature(): React.ReactElement {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--mk-faint)] uppercase">
            Plan + run
          </p>
          <h2 className="mt-3 text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[38px]">
            Write a ticket. Hand it to a worker.
          </h2>
        </div>
        <Link
          href="/learn"
          className="inline-flex h-10 items-center rounded-full bg-[var(--mk-ink)] px-5 text-[13.5px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
        >
          Learn more
        </Link>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <GradientCard variant="violet" className="aspect-[5/4] p-7 lg:p-9">
          <div className="relative flex h-full flex-col justify-between">
            <p className="max-w-[14ch] text-[20px] font-semibold leading-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              Pin a ticket. The right agent picks it up next.
            </p>
            <div className="rounded-xl bg-white/12 p-4 backdrop-blur-md ring-1 ring-white/20">
              <p className="text-[12px] font-semibold tracking-[0.18em] text-white/70 uppercase">
                PLAN-92F
              </p>
              <p className="mt-1.5 text-[14px] font-medium text-white">
                Add quick filters to the board header
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-white/80">
                <span className="rounded-md bg-white/15 px-2 py-0.5">building</span>
                <span className="rounded-md bg-white/15 px-2 py-0.5">claude-sonnet-4-6</span>
              </div>
            </div>
          </div>
        </GradientCard>

        <GradientCard variant="amber" className="aspect-[5/4] p-7 lg:p-9">
          <div className="relative flex h-full flex-col justify-between gap-6">
            <p className="text-[14px] leading-relaxed text-white/95 drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
              In the kanban world that came before parallel AI, one human owned one ticket through
              one terminal. Planbooq fans the same ticket across as many workers as you have keys
              for — and keeps the result legible on a single board.
            </p>
            <div className="self-start rounded-xl bg-black/30 p-3 ring-1 ring-white/20 backdrop-blur-md">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase">
                Workers in flight
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <span
                    key={n}
                    className="inline-block size-2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                  />
                ))}
                <span className="ml-2 text-[12px] font-semibold text-white">7 / 10</span>
              </div>
            </div>
          </div>
        </GradientCard>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <UtilityCard
          title="Lanes"
          body="Customize columns to match how your team actually ships."
        />
        <UtilityCard
          title="Worktrees"
          body="Every Building ticket is its own working copy — no branch dance."
        />
        <UtilityCard
          title="Realtime"
          body="Ably-backed updates so a teammate's drag lands on your board instantly."
        />
      </div>
    </section>
  );
}

function UtilityCard({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-2xl bg-[var(--mk-panel)] p-5">
      <div className="flex size-7 items-center justify-center rounded-md bg-[var(--mk-bg)] text-[var(--mk-ink)] ring-1 ring-[var(--mk-hairline)]">
        <span aria-hidden className="size-2 rounded-full bg-current" />
      </div>
      <p className="mt-4 text-[14px] font-semibold tracking-tight text-[var(--mk-ink)]">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--mk-muted)]">{body}</p>
    </div>
  );
}

/* -------------------------------------------------------- Ship feature -- */

function ShipFeature(): React.ReactElement {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--mk-faint)] uppercase">
            Review + ship
          </p>
          <h2 className="mt-3 text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[38px]">
            Review is a glance, then a merge.
          </h2>
        </div>
        <Link
          href={APP_HREF}
          className="inline-flex h-10 items-center rounded-full bg-[var(--mk-ink)] px-5 text-[13.5px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
        >
          Start building
        </Link>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <GradientCard variant="emerald" className="aspect-[5/4] p-7 lg:p-9">
          <div className="relative flex h-full flex-col justify-between">
            <p className="max-w-[16ch] text-[20px] font-semibold leading-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              The PR shows up on the card. Merge auto-completes the ticket.
            </p>
            <div className="rounded-xl bg-white/12 p-4 backdrop-blur-md ring-1 ring-white/20">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-white">PR #128 · ready</p>
                <span className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <span className="size-1.5 rounded-full bg-emerald-200" />
                  CI green
                </span>
              </div>
              <div className="mt-2.5 text-[11px] text-white/80">
                +124 −18 across 6 files · feat(board): quick filters
              </div>
            </div>
          </div>
        </GradientCard>

        <div className="overflow-hidden rounded-2xl bg-[var(--mk-bg)] p-7 ring-1 ring-[var(--mk-hairline)] lg:p-9">
          <MockChart className="w-full" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <UtilityCard
          title="One-glance review"
          body="The diff, the CI status, the PR description — all on the card."
        />
        <UtilityCard
          title="Send-it-back"
          body="Add a comment, kick the worker back to Building. No tab juggling."
        />
        <UtilityCard
          title="Auto-complete"
          body="Merge the PR and the ticket moves to Completed by itself."
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------- API section -- */

function ApiSection(): React.ReactElement {
  return (
    <section id="api" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20 lg:px-10 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--mk-faint)] uppercase">
            Developers
          </p>
          <h2 className="mt-3 text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[38px]">
            Or drive the board straight
            <br />
            from your AI.
          </h2>
        </div>
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--mk-ink)] hover:opacity-70"
        >
          Explore docs
          <ChevronIcon className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <ul className="divide-y divide-[var(--mk-hairline)]">
          {[
            {
              name: "Tickets API",
              body: "List, create, and mutate tickets with the same shape your board uses.",
            },
            {
              name: "Comments + ship",
              body: "Post results, then call ship() with a PR URL to move a ticket to Review.",
            },
            {
              name: "Error reporting",
              body: "Surface a build failure with one POST — Planbooq labels the card and tags you.",
            },
            {
              name: "Webhooks",
              body: "Subscribe to ticket transitions to fan work to your own runners.",
            },
            {
              name: "Skills + CLI",
              body: "Drop-in wrapper for Claude Code; one binary, hard-coded ticket id, 7-day token.",
            },
          ].map((row) => (
            <li key={row.name} className="grid grid-cols-[160px_1fr] items-baseline gap-6 py-5">
              <p className="text-[14px] font-semibold tracking-tight text-[var(--mk-ink)]">
                {row.name}
              </p>
              <p className="text-[13.5px] leading-relaxed text-[var(--mk-muted)]">{row.body}</p>
            </li>
          ))}
        </ul>

        <div className="overflow-hidden rounded-2xl bg-[#0b0b0d] p-6 text-[12.5px] ring-1 ring-black/20 lg:p-8">
          <div className="flex items-center gap-2 text-[#a3a3a3]">
            <span className="inline-block size-2 rounded-full bg-[#ff5f57]" />
            <span className="inline-block size-2 rounded-full bg-[#febc2e]" />
            <span className="inline-block size-2 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-[11px] font-semibold tracking-[0.16em] uppercase">
              ship.sh
            </span>
          </div>
          <pre className="mt-5 overflow-x-auto font-mono text-[12.5px] leading-[1.65] text-[#e4e4e7]">
            <span className="text-[#71717a]"># Move ticket PLAN-92F to Review with a PR.</span>
            {"\n"}
            <span className="text-[#22d3ee]">curl</span> -X POST{" "}
            <span className="text-[#fbbf24]">"$PLANBOOQ_API/tickets/$ID/ship"</span> \{"\n"}
            {"  "}-H <span className="text-[#fbbf24]">"Authorization: Bearer $PLANBOOQ_TOKEN"</span>{" "}
            \{"\n"}
            {"  "}-H <span className="text-[#fbbf24]">"Content-Type: application/json"</span> \
            {"\n"}
            {"  "}-d <span className="text-[#86efac]">{"'{"}</span>
            {"\n"}
            {"     "}
            <span className="text-[#86efac]">"prUrl"</span>
            <span className="text-[#86efac]">: </span>
            <span className="text-[#fbbf24]">"https://github.com/you/repo/pull/128"</span>
            <span className="text-[#86efac]">,</span>
            {"\n"}
            {"     "}
            <span className="text-[#86efac]">"summary"</span>
            <span className="text-[#86efac]">: </span>
            <span className="text-[#fbbf24]">"Quick filters on the board header"</span>
            <span className="text-[#86efac]">,</span>
            {"\n"}
            {"     "}
            <span className="text-[#86efac]">"branch"</span>
            <span className="text-[#86efac]">: </span>
            <span className="text-[#fbbf24]">"feature/PLAN-92F"</span>
            {"\n"}
            {"  "}
            <span className="text-[#86efac]">{"}'"}</span>
            {"\n\n"}
            <span className="text-[#71717a]">
              {"# {"} ok: true, status: "Review", pr: "#128" {"}"}
            </span>
          </pre>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Research section -- */

function ResearchSection(): React.ReactElement {
  return (
    <section id="research" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20 lg:px-10 lg:py-28">
      <h2 className="max-w-3xl text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[40px]">
        We're researching how humans
        <br />
        and AI ship together.
      </h2>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--mk-muted)]">
        The kanban board hasn't changed since the Toyota factory floor. Parallel AI workers force a
        new question: how does one human stay in the loop on ten threads without it turning into
        chaos? Planbooq is our answer in production.
      </p>

      <div className="mk-research-grid relative mt-12 overflow-hidden rounded-2xl bg-[var(--mk-panel)] p-8 lg:p-12">
        <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-xl">
            <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--mk-faint)] uppercase">
              In labs · 2026.Q2
            </p>
            <h3 className="mt-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--mk-ink)]">
              Glance Mode: surface only the cards that need a human in the next 60 seconds.
            </h3>
            <p className="mt-4 text-[14px] leading-relaxed text-[var(--mk-muted)]">
              An attention model that watches your ten lanes and surfaces the ones blocked on a
              human. Quiet by default; loud when it matters.
            </p>
          </div>
          <div className="relative flex items-center justify-center">
            <div
              className="mk-orb"
              style={{
                ["--orb-a" as string]: "#dad4ff",
                ["--orb-b" as string]: "#a395ff",
                ["--orb-c" as string]: "#5a4cc6",
                ["--orb-d" as string]: "#0e0a26",
                width: 180,
                height: 180,
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl bg-[var(--mk-panel)] p-6">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--mk-faint)] uppercase">
            Paper
          </p>
          <p className="mt-2 text-[15px] font-semibold tracking-tight text-[var(--mk-ink)]">
            Ten lanes, one driver: throughput in parallel AI workflows.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--mk-muted)]">
            What changes when the bottleneck shifts from writing code to merging it.
          </p>
        </div>
        <GradientCard variant="rose" className="aspect-auto p-6">
          <p className="relative text-[12px] font-semibold tracking-[0.18em] text-white/80 uppercase">
            Field study
          </p>
          <p className="relative mt-2 max-w-[24ch] text-[16px] font-semibold leading-snug text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
            Solo founders shipping ten tickets in a day.
          </p>
        </GradientCard>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Safety -- */

function SafetySection(): React.ReactElement {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[40px]">
          Built so parallel work stays safe.
        </h2>
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--mk-ink)] hover:opacity-70"
        >
          Learn more
          <ChevronIcon className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <SafetyCard
          variant="worktree"
          title="Isolated worktrees"
          body="Every Building ticket runs in its own working copy. One worker can't trash another."
        />
        <SafetyCard
          variant="byok"
          title="Bring your own key"
          body="Your API keys, your model bills, your encryption. Hosted compute is a premium opt-in."
        />
        <SafetyCard
          variant="branches"
          title="Branches, not main"
          body="Workers always push to branches. Merging stays a human decision."
        />
      </div>
    </section>
  );
}

function SafetyCard({
  variant,
  title,
  body,
}: {
  variant: "worktree" | "byok" | "branches";
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <div className="rounded-2xl bg-[var(--mk-panel)] p-8">
      <div className="flex aspect-[3/2] items-center justify-center rounded-xl bg-[var(--mk-bg)]/40 ring-1 ring-[var(--mk-hairline)]">
        <SafetyIcon variant={variant} className="h-24 w-auto text-[var(--mk-ink)]" />
      </div>
      <p className="mt-6 text-[15px] font-semibold tracking-tight text-[var(--mk-ink)]">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--mk-muted)]">{body}</p>
    </div>
  );
}

/* ---------------------------------------------------------- Updates -- */

function LatestUpdates(): React.ReactElement {
  const updates: {
    eyebrow: string;
    date: string;
    title: string;
    variant: "violet" | "amber" | "emerald" | "rose" | "sky";
  }[] = [
    {
      eyebrow: "Changelog",
      date: "May 12, 2026",
      title: "Glance Mode is in beta — quiet by default, loud when it matters.",
      variant: "violet",
    },
    {
      eyebrow: "Update",
      date: "Apr 28, 2026",
      title: "Per-ticket worktrees are now the default for new workspaces.",
      variant: "amber",
    },
    {
      eyebrow: "Notes",
      date: "Apr 14, 2026",
      title: "BYOK now supports Anthropic, OpenAI, and Vercel AI gateway.",
      variant: "emerald",
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[40px]">
          Latest updates
        </h2>
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--mk-ink)] hover:opacity-70"
        >
          All posts
          <ChevronIcon className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {updates.map((u) => (
          <GradientCard
            key={u.title}
            variant={u.variant}
            className="flex aspect-[4/5] flex-col justify-between p-6 lg:p-8"
          >
            <p className="relative text-[20px] font-semibold leading-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              {u.title}
            </p>
            <div className="relative">
              <p className="text-[11.5px] font-semibold tracking-[0.16em] text-white/80 uppercase">
                {u.eyebrow}
              </p>
              <p className="mt-1 text-[12px] text-white/70">{u.date}</p>
            </div>
          </GradientCard>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Final CTA -- */

function FinalCta(): React.ReactElement {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-8 pb-24 lg:px-10 lg:pt-12">
      <div className="rounded-2xl bg-[var(--mk-panel)] px-8 py-16 text-center lg:px-12 lg:py-20">
        <h2 className="mx-auto max-w-2xl text-balance text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--mk-ink)] sm:text-[44px]">
          The most direct path from idea to merged PR.
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="mailto:hello@planbooq.app"
            className="inline-flex h-11 items-center rounded-full px-5 text-[14px] font-medium text-[var(--mk-ink)] transition hover:bg-[var(--mk-bg)]"
          >
            Talk to sales
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex h-11 items-center rounded-full bg-[var(--mk-ink)] px-6 text-[14px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
          >
            Create a board
          </Link>
          <Link
            href={DOWNLOAD_HREF}
            className="hidden h-11 items-center rounded-full px-5 text-[14px] font-medium text-[var(--mk-ink)] transition hover:bg-[var(--mk-bg)] sm:inline-flex"
          >
            Download for Mac
          </Link>
        </div>
      </div>
    </section>
  );
}

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
    "The cockpit for vibe coders running ten tickets at once. Drop tickets, fan them out across parallel AI workers, ship without waiting on a single agent.",
};

const APP_HREF = "/welcome";
const CTA_LABEL = "Open the app";
const DOWNLOAD_HREF = "/api/download/mac";
const DOWNLOAD_LABEL = "Download Now";

export default function Home(): React.ReactElement {
  return (
    <main
      className={`${serif.variable} min-h-screen bg-[#F4ECD8] text-[#1F2A1E] antialiased`}
      style={{ colorScheme: "light" }}
    >
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-24 sm:px-8 sm:pt-14">
        <Wordmark />

        <Hero />

        <Pillars />

        <HowItWorks />

        <SoCalMap />

        <BottomCTA />
      </div>
    </main>
  );
}

function Wordmark(): React.ReactElement {
  return (
    <div className="flex justify-center">
      <div className="font-[var(--font-landing-serif)] text-base tracking-[0.18em] text-[#1F2A1E]/70 uppercase">
        Planbooq
      </div>
    </div>
  );
}

type Marker = { name: string; x: number; y: number };

const SOCAL_MARKERS: ReadonlyArray<Marker> = [
  { name: "Santa Barbara", x: 8, y: 22 },
  { name: "Burbank", x: 30, y: 32 },
  { name: "Pasadena", x: 36, y: 34 },
  { name: "Santa Monica", x: 24, y: 42 },
  { name: "Los Angeles", x: 32, y: 42 },
  { name: "Long Beach", x: 34, y: 54 },
  { name: "Anaheim", x: 42, y: 50 },
  { name: "Irvine", x: 48, y: 58 },
  { name: "San Diego", x: 68, y: 80 },
];

const PULSE_PERIOD_S = 2.4;

function SoCalMap(): React.ReactElement {
  const step = PULSE_PERIOD_S / SOCAL_MARKERS.length;
  return (
    <section className="mt-28 sm:mt-36">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-[var(--font-landing-serif)] text-4xl tracking-tight sm:text-5xl">
          Built across <em className="italic text-[#3A5A40]">Southern California</em>
        </h2>
        <p className="mt-5 max-w-md text-balance text-[15px] leading-relaxed text-[#1F2A1E]/70">
          Designed and shipped from the coast.
        </p>
      </div>
      <div
        role="img"
        aria-label="Southern California map with city markers"
        className="relative mx-auto mt-14 aspect-[5/3] w-full max-w-3xl overflow-hidden rounded-[28px] border border-[#1F2A1E]/10 bg-[#EDE2C6] shadow-[0_1px_0_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(31,42,30,0.25)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(201,215,203,0.45)_0%,transparent_55%),radial-gradient(circle_at_70%_75%,rgba(201,215,203,0.35)_0%,transparent_50%)]"
        />
        {SOCAL_MARKERS.map((m, i) => (
          <span
            key={m.name}
            className="socal-marker absolute size-2 rounded-full bg-[#2F4A2C]"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              animationDelay: `${(i * step).toFixed(3)}s`,
            }}
            title={m.name}
          />
        ))}
      </div>
    </section>
  );
}

function Hero(): React.ReactElement {
  return (
    <section className="mt-12 flex flex-col items-center text-center sm:mt-16">
      <h1 className="font-[var(--font-landing-serif)] max-w-3xl text-balance text-5xl leading-[1.05] tracking-tight sm:text-7xl">
        Ship <strong className="font-semibold text-[#3A5A40]">while it builds</strong>.
      </h1>
      <p className="mt-7 max-w-xl text-balance text-base leading-relaxed text-[#1F2A1E]/75 sm:text-lg">
        The cockpit for vibe coders running ten tickets at once. Drop tickets, watch parallel AI
        workers run them through, never wait on a single agent. The offspring of Cursor, Linear, and
        Notion — built ground-up for velocity.
      </p>
      <div className="mt-9 flex flex-col items-center gap-5">
        <Link
          href={DOWNLOAD_HREF}
          aria-label={DOWNLOAD_LABEL}
          className="group inline-flex h-14 items-center gap-3 rounded-full bg-[#2F4A2C] px-10 text-base font-semibold tracking-wide text-[#F4ECD8] shadow-[0_2px_0_rgba(0,0,0,0.04),0_20px_40px_-12px_rgba(31,42,30,0.45)] ring-1 ring-[#1F2A1E]/10 transition will-change-transform hover:-translate-y-0.5 hover:bg-[#243B22] hover:shadow-[0_2px_0_rgba(0,0,0,0.04),0_28px_50px_-14px_rgba(31,42,30,0.55)] focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F4A2C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4ECD8] sm:h-16 sm:px-12 sm:text-lg"
        >
          <DownloadGlyph />
          {DOWNLOAD_LABEL}
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={APP_HREF}
            className="inline-flex h-11 items-center rounded-full border border-[#1F2A1E]/20 bg-[#F4ECD8] px-6 text-sm font-medium text-[#1F2A1E] transition hover:border-[#1F2A1E]/40 hover:bg-[#EDE2C6]"
          >
            {CTA_LABEL}
          </Link>
          <a
            href="#how"
            className="inline-flex h-11 items-center rounded-full border border-[#1F2A1E]/20 bg-[#F4ECD8] px-6 text-sm font-medium text-[#1F2A1E] transition hover:border-[#1F2A1E]/40 hover:bg-[#EDE2C6]"
          >
            See how it works
          </a>
        </div>
      </div>

      <HeroScene />
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

function HeroScene(): React.ReactElement {
  return (
    <div className="relative mt-14 w-full overflow-hidden rounded-[28px] border border-[#1F2A1E]/10 shadow-[0_1px_0_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(31,42,30,0.25)]">
      <svg
        viewBox="0 0 1200 540"
        preserveAspectRatio="xMidYMid slice"
        className="block h-[280px] w-full sm:h-[460px]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9D7E8" />
            <stop offset="55%" stopColor="#E5DDC2" />
            <stop offset="100%" stopColor="#EFE5C8" />
          </linearGradient>
          <linearGradient id="far-hills" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8FA593" />
            <stop offset="100%" stopColor="#A6B9A6" />
          </linearGradient>
          <linearGradient id="mid-hills" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5F7A4F" />
            <stop offset="100%" stopColor="#6E8A5C" />
          </linearGradient>
          <linearGradient id="near-field" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F6A3B" />
            <stop offset="100%" stopColor="#3A5A30" />
          </linearGradient>
          <radialGradient id="sun" cx="0.78" cy="0.22" r="0.18">
            <stop offset="0%" stopColor="#FFF6DE" />
            <stop offset="100%" stopColor="#FFF6DE" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1200" height="540" fill="url(#sky)" />
        <rect width="1200" height="540" fill="url(#sun)" />

        {/* clouds */}
        <g fill="#FBF6E3" opacity="0.85">
          <ellipse cx="180" cy="120" rx="110" ry="14" />
          <ellipse cx="240" cy="138" rx="80" ry="10" />
          <ellipse cx="780" cy="90" rx="140" ry="12" />
          <ellipse cx="980" cy="160" rx="90" ry="9" />
        </g>

        {/* far hills */}
        <path
          d="M0,360 C160,300 280,330 440,310 C600,290 760,340 940,320 C1080,304 1140,316 1200,310 L1200,540 L0,540 Z"
          fill="url(#far-hills)"
        />

        {/* mid hills */}
        <path
          d="M0,410 C140,360 320,400 520,380 C720,360 880,420 1080,400 C1140,394 1180,402 1200,400 L1200,540 L0,540 Z"
          fill="url(#mid-hills)"
        />

        {/* tree silhouettes */}
        <g fill="#2F4A2C" opacity="0.9">
          <circle cx="120" cy="385" r="22" />
          <circle cx="148" cy="380" r="18" />
          <circle cx="172" cy="388" r="20" />
          <rect x="138" y="395" width="6" height="22" rx="2" />

          <circle cx="940" cy="378" r="20" />
          <circle cx="966" cy="384" r="16" />
          <rect x="946" y="390" width="5" height="20" rx="2" />
        </g>

        {/* near field */}
        <path
          d="M0,440 C200,420 420,470 640,450 C860,432 1020,478 1200,460 L1200,540 L0,540 Z"
          fill="url(#near-field)"
        />

        {/* grass strokes */}
        <g stroke="#2F4A2C" strokeWidth="1.2" strokeLinecap="round" opacity="0.55">
          {Array.from({ length: 90 }).map((_, i) => {
            const x = (i * 1200) / 90 + (i % 3) * 4;
            const y = 470 + (i % 5) * 4;
            return <line key={i} x1={x} y1={y} x2={x + 2} y2={y - 8} />;
          })}
        </g>

        {/* lone figure */}
        <g transform="translate(560,360)">
          <ellipse cx="0" cy="60" rx="22" ry="4" fill="#1F2A1E" opacity="0.25" />
          <path d="M-8,-30 Q-12,0 -10,55 L10,55 Q12,0 8,-30 Z" fill="#E8DFC4" />
          <circle cx="0" cy="-38" r="10" fill="#E8C9A8" />
          <path d="M-10,-44 Q0,-58 10,-44 L10,-38 L-10,-38 Z" fill="#3A5A40" />
        </g>
      </svg>
    </div>
  );
}

function Pillars(): React.ReactElement {
  return (
    <section className="mt-24 sm:mt-32">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-[var(--font-landing-serif)] text-4xl tracking-tight sm:text-5xl">
          Built for throughput.
        </h2>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-3">
        <Tile
          tone="olive"
          eyebrow="01"
          title="Run ten in parallel."
          body="Drop a backlog of tickets and they all start at once — each in its own isolated worktree. Your wall-clock collapses to whatever the slowest worker takes."
        />
        <Tile
          tone="forest"
          eyebrow="02"
          title="Tokens that ship, not stall."
          body="Parallel generation replaces serial re-prompts. Every token spent moves a ticket forward instead of nudging the same draft toward 'fine.'"
        />
        <Tile
          tone="sky"
          eyebrow="03"
          title="One surface for the whole loop."
          body="Cursor's AI muscle, Linear's ticket discipline, Notion's calm visual order — collapsed into one fast desktop cockpit, keyboard-first end to end."
        />
      </div>
    </section>
  );
}

function Tile({
  tone,
  eyebrow,
  title,
  body,
}: {
  tone: "olive" | "forest" | "sky";
  eyebrow: string;
  title: string;
  body: string;
}): React.ReactElement {
  const palette = {
    olive: {
      bg: "#6E7340",
      ink: "#F4ECD8",
      mute: "rgba(244,236,216,0.78)",
    },
    forest: {
      bg: "#2F4A2C",
      ink: "#F4ECD8",
      mute: "rgba(244,236,216,0.78)",
    },
    sky: {
      bg: "#C9D7CB",
      ink: "#1F2A1E",
      mute: "rgba(31,42,30,0.7)",
    },
  }[tone];

  return (
    <article
      className="relative flex aspect-[5/6] flex-col justify-between overflow-hidden rounded-3xl p-7 sm:aspect-[4/5]"
      style={{ backgroundColor: palette.bg, color: palette.ink }}
    >
      <TileGlyph tone={tone} />
      <div className="relative z-10">
        <div
          className="font-[var(--font-landing-serif)] text-xs tracking-[0.22em] uppercase"
          style={{ color: palette.mute }}
        >
          {eyebrow}
        </div>
        <h3 className="font-[var(--font-landing-serif)] mt-2 text-2xl leading-tight tracking-tight sm:text-3xl">
          {title}
        </h3>
      </div>
      <p
        className="relative z-10 mt-6 text-sm leading-relaxed sm:text-[15px]"
        style={{ color: palette.mute }}
      >
        {body}
      </p>
    </article>
  );
}

function TileGlyph({ tone }: { tone: "olive" | "forest" | "sky" }): React.ReactElement {
  if (tone === "olive") {
    return (
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-25"
        width="220"
        height="220"
        viewBox="0 0 220 220"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <rect
            key={i}
            x={20 + i * 12}
            y={20 + i * 12}
            width={180 - i * 24}
            height={180 - i * 24}
            rx="14"
            fill="none"
            stroke="#F4ECD8"
            strokeWidth="1.4"
          />
        ))}
      </svg>
    );
  }
  if (tone === "forest") {
    return (
      <svg
        className="absolute right-6 bottom-6 opacity-30"
        width="160"
        height="160"
        viewBox="0 0 160 160"
        aria-hidden="true"
      >
        <circle cx="80" cy="80" r="50" fill="none" stroke="#F4ECD8" strokeWidth="1.5" />
        <circle cx="80" cy="80" r="30" fill="none" stroke="#F4ECD8" strokeWidth="1.5" />
        <circle cx="80" cy="80" r="10" fill="#F4ECD8" />
        <line x1="80" y1="10" x2="80" y2="150" stroke="#F4ECD8" strokeWidth="0.8" />
        <line x1="10" y1="80" x2="150" y2="80" stroke="#F4ECD8" strokeWidth="0.8" />
      </svg>
    );
  }
  return (
    <svg
      className="absolute right-4 -bottom-2 opacity-60"
      width="200"
      height="160"
      viewBox="0 0 200 160"
      aria-hidden="true"
    >
      <path
        d="M0,140 C40,120 70,135 110,118 C150,100 180,118 200,108 L200,160 L0,160 Z"
        fill="#1F2A1E"
        opacity="0.18"
      />
      <path
        d="M0,150 C40,138 80,148 120,138 C160,128 180,140 200,134 L200,160 L0,160 Z"
        fill="#1F2A1E"
        opacity="0.25"
      />
    </svg>
  );
}

function HowItWorks(): React.ReactElement {
  return (
    <section id="how" className="mt-28 sm:mt-36">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-[var(--font-landing-serif)] text-4xl tracking-tight sm:text-5xl">
          How Planbooq works
        </h2>
        <p className="mt-5 max-w-md text-balance text-[15px] leading-relaxed text-[#1F2A1E]/70">
          Four steps, zero waiting. Drop a ticket and move to the next one — workers run in parallel
          behind you.
        </p>
      </div>
      <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        <Step
          n={1}
          title="Drop a ticket"
          body="Describe what you want and move on. The cmd-K palette keeps your hands on the keyboard."
          glyph={<StepDrop />}
        />
        <Step
          n={2}
          title="Fan out"
          body="Workers spin up in parallel — each its own branch and worktree. Queue the next ticket; you do not wait."
          glyph={<StepFanOut />}
        />
        <Step
          n={3}
          title="Glance & decide"
          body="Live preview URLs and auto-screenshots. Seconds of attention per ticket, not minutes of re-prompts."
          glyph={<StepCompare />}
        />
        <Step
          n={4}
          title="Ship"
          body="One click opens the PR and clears the lane. Merge auto-completes the ticket back to the board."
          glyph={<StepPick />}
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
      <div className="font-[var(--font-landing-serif)] mt-4 text-xs tracking-[0.22em] text-[#1F2A1E]/55 uppercase">
        Step 0{n}
      </div>
      <h3 className="font-[var(--font-landing-serif)] mt-1 text-xl tracking-tight">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-[#1F2A1E]/70">{body}</p>
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

function StepPick(): React.ReactElement {
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
        <h2 className="font-[var(--font-landing-serif)] text-4xl leading-tight tracking-tight sm:text-6xl">
          Stop watching agents.{" "}
          <strong className="font-semibold text-[#3A5A40]">Start shipping</strong>.
        </h2>
        <p className="mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-[#1F2A1E]/70">
          Real-time multiplayer kanban, full keyboard nav, GitHub-wired tickets, BYOK so unit
          economics stay yours. One surface, ten things in flight, none of them blocking you.
        </p>

        <PromptBar />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={APP_HREF}
            className="inline-flex h-11 items-center rounded-full bg-[#1F2A1E] px-6 text-sm font-medium text-[#F4ECD8] transition hover:bg-[#2F4A2C]"
          >
            {CTA_LABEL}
          </Link>
          <span className="text-xs tracking-[0.16em] text-[#1F2A1E]/55 uppercase">
            Runs on top of your GitHub repos
          </span>
        </div>
      </div>
    </section>
  );
}

function PromptBar(): React.ReactElement {
  return (
    <div className="mt-12 w-full max-w-2xl">
      <div className="rounded-2xl border border-[#1F2A1E]/12 bg-white/70 p-3 shadow-[0_1px_0_rgba(0,0,0,0.03),0_18px_44px_-22px_rgba(31,42,30,0.25)] backdrop-blur">
        <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1F2A1E"
            strokeOpacity="0.5"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 text-left text-[15px] text-[#1F2A1E]/55">
            Add a ticket — "Hero section, friendlier, swap CTA copy…"
          </span>
          <span className="rounded-md border border-[#1F2A1E]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#1F2A1E]/55">
            ⌘K
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between px-2 pt-1 pb-1 text-[11px] tracking-[0.16em] text-[#1F2A1E]/45 uppercase">
          <span>Runs in parallel</span>
          <span>You move on</span>
        </div>
      </div>
    </div>
  );
}

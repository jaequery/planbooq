import Link from "next/link";
import { MarketingThemeToggle } from "./theme-toggle";

export const APP_HREF = "/welcome";
// Direct link to the actual DMG binary. GitHub's `releases/latest/download/<asset>`
// alias always resolves to the latest published release's asset of that exact
// name — the desktop-release workflow uploads `Planbooq-arm64.dmg` on every push
// to main, so this URL stays valid without per-release edits. arm64 is the
// default (~95% of Macs since 2021); Intel users can grab the x64 build from
// the releases page if needed.
export const DOWNLOAD_HREF =
  "https://github.com/jaequery/planbooq/releases/latest/download/Planbooq-arm64.dmg";

export const PRINCIPLES = [
  "We dogfood parallel shipping: we have kept ten tickets moving at once—because serial work wastes wall-clock time.",
  "We combine the best of modern vibe coding—plan, harness, and execute—so you are not bouncing between Linear, Cursor, and guesswork.",
  "We write for every builder: founders, PMs, and designers shipping web projects—not only senior engineers.",
] as const;

export const TEAM = [
  {
    name: "Alex Rivera",
    title: "Product & platform",
    image:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80",
    alt: "Portrait of a team member",
  },
  {
    name: "Jordan Kim",
    title: "Engineering lead",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=800&q=80",
    alt: "Portrait of a team member",
  },
  {
    name: "Sam Okonkwo",
    title: "Design & brand",
    image:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=800&q=80",
    alt: "Portrait of a team member",
  },
] as const;

export const IMG_OFFICE =
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=80";
export const IMG_MEETING =
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1200&q=80";

export function serifClassName(extra?: string): string {
  return [extra, "font-[family-name:var(--font-landing-serif)]"].filter(Boolean).join(" ");
}

export function Footer(): React.ReactElement {
  return (
    <footer className="bg-[var(--mk-ink)] text-[var(--mk-bg)]">
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-8 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn
            heading="Product"
            links={[
              { label: "How it works", href: "/#learn" },
              { label: "Pricing", href: "/pricing" },
              { label: "Download", href: DOWNLOAD_HREF },
              { label: "Start building", href: APP_HREF },
            ]}
          />
          <FooterColumn
            heading="Company"
            links={[
              { label: "GitHub", href: "https://github.com/planbooq" },
              { label: "Careers", href: "mailto:hello@planbooq.app" },
            ]}
          />
          <FooterColumn
            heading="Legal"
            links={[
              { label: "Privacy", href: "#" },
              { label: "Terms", href: "#" },
            ]}
          />
          <FooterColumn
            heading="Social"
            links={[
              { label: "GitHub", href: "https://github.com/planbooq" },
              { label: "X", href: "#" },
            ]}
          />
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-white/15 pt-10 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className={serifClassName(
              "text-xl font-semibold tracking-[0.02em] text-white uppercase",
            )}
          >
            Planbooq
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://github.com/planbooq"
              aria-label="GitHub"
              className="text-white/70 transition hover:text-white"
            >
              <GitHubGlyph className="h-5 w-5" />
            </a>
            <MarketingThemeToggle />
          </div>
        </div>

        <p className="mt-10 text-[11px] leading-relaxed text-white/45">
          Planbooq helps you plan and ship web projects with AI—without juggling a stack of tools.
          Team photos on this page are stock imagery for layout demonstration.
        </p>
        <p className="mt-4 text-[11px] text-white/45">© {new Date().getFullYear()} Planbooq</p>
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
    <div>
      <h3 className="text-[13px] font-semibold text-white">{heading}</h3>
      <ul className="mt-4 flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="text-[14px] text-white/55 transition hover:text-white">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GitHubGlyph({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.43-2.69 5.4-5.25 5.69.41.35.78 1.04.78 2.1v3.11c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function ChevronIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PrimaryCta({
  href,
  children,
  inverted,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  inverted?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center rounded-lg px-8 text-[15px] font-semibold transition hover:opacity-90 ${
        inverted
          ? "bg-[var(--mk-bg)] text-[var(--mk-ink)]"
          : "bg-[var(--mk-ink)] text-[var(--mk-bg)]"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

export function SecondaryCta({
  href,
  children,
  inverted,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  inverted?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center rounded-lg px-6 text-[15px] font-medium transition ${
        inverted
          ? "border border-white/25 text-[var(--mk-bg)] hover:bg-white/10"
          : "border border-[var(--mk-hairline-strong)] text-[var(--mk-ink)] hover:bg-[var(--mk-surface)]"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

export function SkyscraperIllustration({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 320 400" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.25"
        d="M96 56v328M224 56v328M96 56h128M96 384h128"
      />
      <path
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.35"
        d="M112 80h96M112 104h96M112 128h80"
      />
      {Array.from({ length: 18 }, (_, i) => {
        const y = 152 + i * 12;
        return (
          <path
            key={`w-${y}`}
            stroke="currentColor"
            strokeWidth="0.85"
            opacity={0.2 + (i % 3) * 0.08}
            d={`M108 ${y}h104`}
          />
        );
      })}
      <path stroke="currentColor" strokeWidth="1.25" d="M120 40 L160 12 200 40M120 40h80v16h-80z" />
      <rect
        x="132"
        y="68"
        width="56"
        height="8"
        stroke="currentColor"
        strokeWidth="0.9"
        fill="none"
      />
      <path
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.4"
        d="M104 200h112M104 248h112M104 296h96"
      />
    </svg>
  );
}

export function KanbanStacksIllustration({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 280 360" fill="none" aria-hidden="true">
      {Array.from({ length: 4 }, (_, col) => {
        const x = 40 + col * 58;
        return (
          <g key={col}>
            <rect
              x={x}
              y="40"
              width="50"
              height="300"
              rx="6"
              stroke="currentColor"
              strokeWidth="1"
              opacity={0.15 + col * 0.05}
            />
            {[0, 1, 2].map((row) => (
              <rect
                key={row}
                x={x + 6}
                y={56 + row * 76}
                width="38"
                height="56"
                rx="4"
                stroke="currentColor"
                strokeWidth="0.9"
                fill="none"
                opacity={0.35 + row * 0.1}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Planbooq-style board: Building lane highlighted with nitro, streaks, and power-up cues (AI shipping). */
export function NitroKanbanIllustration({ className }: { className?: string }): React.ReactElement {
  const col = (i: number) => 22 + i * (90 + 10);
  return (
    <svg
      className={className}
      viewBox="0 0 540 384"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* App chrome */}
      <rect
        x="10"
        y="8"
        width="520"
        height="368"
        rx="12"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.2"
      />
      <circle cx="26" cy="28" r="3.5" fill="currentColor" opacity="0.25" />
      <circle cx="38" cy="28" r="3.5" fill="currentColor" opacity="0.18" />
      <circle cx="50" cy="28" r="3.5" fill="currentColor" opacity="0.12" />
      <text
        x="64"
        y="32"
        fill="currentColor"
        opacity="0.5"
        style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em" }}
        className="font-[family-name:var(--font-geist-sans,sans-serif)]"
      >
        planbooq · main board
      </text>
      {/* AI / speed hint */}
      <g opacity="0.55">
        <rect
          x="412"
          y="18"
          width="108"
          height="22"
          rx="6"
          stroke="currentColor"
          strokeWidth="0.9"
          fill="currentColor"
          fillOpacity="0.06"
        />
        <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M424 29l4 4 8-10" />
        <text
          x="436"
          y="33"
          fill="currentColor"
          style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em" }}
          className="font-[family-name:var(--font-geist-sans,sans-serif)]"
        >
          AI LANES ON
        </text>
      </g>
      {/* Sparkle trail toward Building */}
      <path
        stroke="currentColor"
        strokeWidth="0.75"
        strokeDasharray="4 5"
        opacity="0.25"
        d="M448 42 C380 52 320 60 255 78"
      />

      {["BACKLOG", "TODO", "BUILDING", "REVIEW", "COMPLETED"].map((label, i) => {
        const x = col(i);
        const isBuild = label === "BUILDING";
        return (
          <g key={label}>
            {isBuild ? (
              <rect
                x={x - 4}
                y="54"
                width="98"
                height="312"
                rx="12"
                fill="currentColor"
                fillOpacity="0.07"
                stroke="currentColor"
                strokeWidth="1.1"
                opacity="0.9"
              />
            ) : (
              <rect
                x={x}
                y="58"
                width="90"
                height="304"
                rx="10"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.14"
                fill="none"
              />
            )}
            <text
              x={x + 45}
              y="52"
              textAnchor="middle"
              fill="currentColor"
              opacity={isBuild ? 0.85 : 0.4}
              style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.14em" }}
              className="font-[family-name:var(--font-geist-sans,sans-serif)]"
            >
              {label}
            </text>
            {isBuild ? (
              <text
                x={x + 45}
                y="70"
                textAnchor="middle"
                fill="currentColor"
                opacity="0.45"
                style={{ fontSize: "7.5px", fontWeight: 600 }}
                className="font-[family-name:var(--font-geist-sans,sans-serif)]"
              >
                4 agents running
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Cards: Backlog */}
      <g opacity="0.55">
        <rect
          x={col(0) + 8}
          y="88"
          width="74"
          height="42"
          rx="5"
          stroke="currentColor"
          strokeWidth="0.9"
        />
        <rect
          x={col(0) + 14}
          y="98"
          width="40"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.2"
        />
        <rect
          x={col(0) + 14}
          y="106"
          width="54"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.12"
        />
        <rect
          x={col(0) + 8}
          y="138"
          width="74"
          height="42"
          rx="5"
          stroke="currentColor"
          strokeWidth="0.9"
        />
        <rect
          x={col(0) + 8}
          y="188"
          width="74"
          height="42"
          rx="5"
          stroke="currentColor"
          strokeWidth="0.9"
        />
      </g>

      {/* Todo */}
      <g opacity="0.62">
        <rect
          x={col(1) + 8}
          y="88"
          width="74"
          height="42"
          rx="5"
          stroke="currentColor"
          strokeWidth="0.9"
        />
        <rect
          x={col(1) + 14}
          y="98"
          width="46"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.22"
        />
        <rect
          x={col(1) + 8}
          y="140"
          width="74"
          height="42"
          rx="5"
          stroke="currentColor"
          strokeWidth="0.9"
        />
      </g>

      {/* Building: nitro cards */}
      <g>
        {/* Speed streaks */}
        <g opacity="0.35">
          <path
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
            d="M330 120h52M338 138h44M324 156h60"
          />
          <path
            stroke="currentColor"
            strokeWidth="0.6"
            strokeLinecap="round"
            opacity="0.5"
            d="M342 176h48"
          />
        </g>
        {/* Running pulse rings */}
        <circle
          cx={col(2) + 45}
          cy="156"
          r="28"
          stroke="currentColor"
          strokeWidth="0.7"
          opacity="0.2"
          className="marketing-nitro-pulse"
        />
        <rect
          x={col(2) + 8}
          y="98"
          width="74"
          height="48"
          rx="6"
          stroke="currentColor"
          strokeWidth="1.15"
          fill="currentColor"
          fillOpacity="0.04"
        />
        <rect
          x={col(2) + 15}
          y="108"
          width="48"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.35"
        />
        <rect
          x={col(2) + 15}
          y="116"
          width="36"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.18"
        />
        {/* Lightning power-up */}
        <g transform={`translate(${col(2) + 58}, 92)`}>
          <circle
            r="12"
            stroke="currentColor"
            strokeWidth="0.9"
            opacity="0.45"
            fill="currentColor"
            fillOpacity="0.08"
          />
          <path fill="currentColor" opacity="0.65" d="M-1-6 4 0l-3 2 5 7-2-5-3 2Z" />
        </g>
        <rect
          x={col(2) + 8}
          y="160"
          width="74"
          height="48"
          rx="6"
          stroke="currentColor"
          strokeWidth="1.15"
          fill="currentColor"
          fillOpacity="0.04"
        />
        <rect
          x={col(2) + 15}
          y="172"
          width="52"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.28"
        />
        {/* Star power-up */}
        <g transform={`translate(${col(2) + 70}, 186)`} opacity="0.7">
          <path
            fill="currentColor"
            d="M0-8 2.2-2.2 8 0 2.2 2.2 0 8-2.2 2.2-8 0-2.2-2.2Z"
            transform="scale(0.45)"
          />
        </g>
        {/* Nitro engine + exhaust */}
        <g transform={`translate(${col(2) + 45}, 288)`}>
          <rect
            x="-22"
            y="-8"
            width="44"
            height="22"
            rx="5"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.45"
          />
          <rect
            x="-14"
            y="14"
            width="8"
            height="18"
            rx="2"
            stroke="currentColor"
            strokeWidth="0.85"
            opacity="0.4"
          />
          <rect
            x="6"
            y="14"
            width="8"
            height="18"
            rx="2"
            stroke="currentColor"
            strokeWidth="0.85"
            opacity="0.4"
          />
          <text
            x="0"
            y="4"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.5"
            style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.2em" }}
            className="font-[family-name:var(--font-geist-sans,sans-serif)]"
          >
            NITRO
          </text>
          <g className="marketing-nitro-flame" opacity="0.55">
            <path
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
              d="M28 4c12-6 28-4 38 4c-10 8-22 14-38 10"
            />
            <path
              stroke="currentColor"
              strokeWidth="0.9"
              strokeLinecap="round"
              fill="none"
              opacity="0.7"
              d="M32 10c8-4 18-2 24 2"
            />
          </g>
          <path
            stroke="currentColor"
            strokeWidth="0.75"
            strokeLinecap="round"
            opacity="0.3"
            d="M52 0h36M56 8h32M50 16h40"
          />
        </g>
        {/* Chevrons >> ship speed */}
        <g transform="translate(408, 130)" opacity="0.45">
          <path
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            d="M0 0l8 12-8 12M12 0l8 12-8 12M24 0l8 12-8 12"
          />
        </g>
      </g>

      {/* Review */}
      <g opacity="0.68">
        <rect
          x={col(3) + 8}
          y="98"
          width="74"
          height="48"
          rx="6"
          stroke="currentColor"
          strokeWidth="0.95"
        />
        <rect
          x={col(3) + 14}
          y="110"
          width="44"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.25"
        />
        <rect
          x={col(3) + 52}
          y="100"
          width="26"
          height="14"
          rx="3"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.5"
          fill="currentColor"
          fillOpacity="0.08"
        />
        <text
          x={col(3) + 65}
          y="110"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.55"
          style={{ fontSize: "7px", fontWeight: 700 }}
          className="font-[family-name:var(--font-geist-sans,sans-serif)]"
        >
          PR
        </text>
      </g>

      {/* Done */}
      <g opacity="0.38">
        <rect
          x={col(4) + 8}
          y="98"
          width="74"
          height="42"
          rx="5"
          stroke="currentColor"
          strokeWidth="0.85"
        />
        <path
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          d={`M${col(4) + 52} 116l6 6 12-14`}
        />
      </g>
    </svg>
  );
}

export function HandsTrustIllustration({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 280 200" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        d="M20 120c24-40 48-56 72-56 16 0 28 12 36 28"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        d="M260 120c-24-40-48-56-72-56-16 0-28 12-36 28"
      />
      <rect
        x="108"
        y="64"
        width="64"
        height="96"
        rx="8"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="var(--mk-bg)"
      />
      <rect x="116" y="76" width="48" height="8" rx="2" fill="currentColor" opacity="0.12" />
      <rect x="116" y="92" width="36" height="4" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="116" y="104" width="44" height="4" rx="1" fill="currentColor" opacity="0.15" />
      <circle
        cx="140"
        cy="132"
        r="12"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

export function BustIllustration({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 120 140" fill="none" aria-hidden="true">
      <ellipse
        cx="60"
        cy="118"
        rx="36"
        ry="10"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.25"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        d="M60 24c-18 0-32 14-32 32v20c0 16 14 28 32 28s32-12 32-28V56c0-18-14-32-32-32z"
      />
      <circle cx="60" cy="52" r="22" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="60" cy="52" r="14" stroke="currentColor" strokeWidth="0.9" opacity="0.5" />
      <path stroke="currentColor" strokeWidth="1" d="M36 92c8 10 20 16 24 16s16-6 24-16" />
      <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M48 48v8M72 48v8" />
    </svg>
  );
}

export function BullIllustration({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M40 100c8-32 28-48 52-48 12 0 24 8 28 20l8 28M88 52l-8-20M120 48l12-16M148 72l16-8"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.25"
        d="M56 112c20 24 52 28 76 8 12-10 20-24 20-40"
      />
      <path stroke="currentColor" strokeWidth="1" opacity="0.45" d="M72 120h56M64 128h64" />
    </svg>
  );
}

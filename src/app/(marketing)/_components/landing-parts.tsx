import Link from "next/link";
import { MarketingThemeToggle } from "./theme-toggle";

export const APP_HREF = "/welcome";
// Direct link to the latest published macOS DMG asset.
export const DOWNLOAD_HREF =
  "https://github.com/jaequery/planbooq/releases/latest/download/Planbooq-arm64.dmg";

export const PRINCIPLES = [
  "We dogfood parallel shipping: we have kept ten tickets moving at once—because serial work wastes wall-clock time.",
  "We combine the best of modern vibe coding—plan, harness, and execute—so you are not bouncing between Linear, Cursor, and guesswork.",
  "We write for every builder: founders, PMs, and designers shipping web projects—not only senior engineers.",
] as const;

/** Used by /learn and /pricing pages — keep around even though the new landing
 *  is all sans-serif. */
export function serifClassName(extra?: string): string {
  return [extra, "font-[family-name:var(--font-landing-serif)]"].filter(Boolean).join(" ");
}

export function Footer(): React.ReactElement {
  return (
    <footer className="bg-[var(--mk-ink)] text-[var(--mk-bg)]">
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 lg:px-10">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white"
            >
              <span
                aria-hidden
                className="inline-block size-4 rounded-[3px] bg-white [clip-path:polygon(0_0,100%_0,100%_60%,60%_60%,60%_100%,0_100%)]"
              />
              Planbooq
            </Link>
            <p className="mt-5 max-w-xs text-[13px] leading-relaxed text-white/55">
              A kanban for builders shipping with parallel AI workers. One board, many lanes, one
              human in the loop.
            </p>
            <div className="mt-6">
              <MarketingThemeToggle />
            </div>
          </div>
          <FooterColumn
            heading="Product"
            links={[
              { label: "How it works", href: "/learn" },
              { label: "Pricing", href: "/pricing" },
              { label: "Download", href: DOWNLOAD_HREF },
              { label: "Start building", href: APP_HREF },
            ]}
          />
          <FooterColumn
            heading="Developers"
            links={[
              { label: "API", href: "/#api" },
              { label: "CLI", href: "/learn" },
              { label: "GitHub", href: "https://github.com/planbooq" },
            ]}
          />
          <FooterColumn
            heading="Company"
            links={[
              { label: "Careers", href: "mailto:hello@planbooq.app" },
              { label: "Contact", href: "mailto:hello@planbooq.app" },
              { label: "Privacy", href: "#" },
              { label: "Terms", href: "#" },
            ]}
          />
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-white/50">© {new Date().getFullYear()} Planbooq</p>
          <a
            href="https://github.com/planbooq"
            aria-label="GitHub"
            className="text-white/55 transition hover:text-white"
          >
            <GitHubGlyph className="h-5 w-5" />
          </a>
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
    <div>
      <h3 className="text-[12px] font-semibold tracking-[0.18em] text-white uppercase">
        {heading}
      </h3>
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
      className={`inline-flex h-12 items-center rounded-full px-7 text-[14.5px] font-semibold transition hover:opacity-90 ${
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
      className={`inline-flex h-12 items-center rounded-full px-6 text-[14.5px] font-medium transition ${
        inverted
          ? "border border-white/25 text-[var(--mk-bg)] hover:bg-white/10"
          : "border border-[var(--mk-hairline-strong)] text-[var(--mk-ink)] hover:bg-[var(--mk-surface)]"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

/** Used by /learn page — kept as a simple bust line drawing. */
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

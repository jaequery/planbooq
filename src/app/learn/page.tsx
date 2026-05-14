import { Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import {
  APP_HREF,
  BustIllustration,
  ChevronIcon,
  Footer,
  PRINCIPLES,
  PrimaryCta,
  serifClassName,
} from "../(marketing)/_components/landing-parts";
import { Header } from "../(marketing)/_components/marketing-header";

const landingSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-landing-serif",
});

export const metadata = {
  title: "Learn — Planbooq",
  description:
    "How we think about Planbooq: parallel shipping, the modern vibe-coding stack in one surface, and writing for every builder—not only senior engineers.",
};

export default function LearnPage(): React.ReactElement {
  return (
    <main
      className={`marketing ${landingSerif.variable} relative min-h-screen overflow-x-hidden bg-[var(--mk-bg)] text-[var(--mk-ink)] antialiased`}
    >
      <Header />

      <section className="mx-auto max-w-3xl px-6 pt-20 pb-12 text-center lg:px-8 lg:pt-28">
        <h1
          className={serifClassName(
            "text-balance text-[2.5rem] font-bold leading-[1.1] sm:text-6xl sm:leading-[1.05]",
          )}
        >
          How we think about Planbooq
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-[18px] leading-relaxed text-[var(--mk-muted)]">
          The principles guiding how we build the kanban for parallel AI shipping—why one terminal
          at a time is broken, and what we replace it with.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-20">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col items-start">
            <BustIllustration className="mb-10 w-32 text-[var(--mk-ink)]" />
            <h2 className={serifClassName("max-w-sm text-3xl font-semibold sm:text-4xl")}>
              Principles we ship by
            </h2>
            <Link
              href="https://github.com/planbooq"
              className="mt-8 inline-flex h-11 items-center rounded-lg bg-[var(--mk-ink)] px-6 text-[14px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
            >
              Read the repo
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--mk-hairline-strong)]">
            {PRINCIPLES.map((line) => (
              <li key={line}>
                <a
                  href={APP_HREF}
                  className="group flex items-center justify-between gap-4 py-6 text-left text-[17px] font-medium transition hover:opacity-70"
                >
                  <span>{line}</span>
                  <ChevronIcon className="h-5 w-5 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center lg:px-8 lg:py-28">
        <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl lg:text-5xl")}>
          Keep ten tickets moving at once.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--mk-muted)]">
          Spin up the kanban, point it at a repo, and start shipping. Bring your own Claude key and
          watch many tickets land in parallel.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PrimaryCta href={APP_HREF}>Start building</PrimaryCta>
        </div>
      </section>

      <Footer />
    </main>
  );
}

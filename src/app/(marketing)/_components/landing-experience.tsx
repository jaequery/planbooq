import Image from "next/image";
import Link from "next/link";
import { LANDING_COPY, type LandingCopy } from "./landing-copy-variants";
import {
  APP_HREF,
  BustIllustration,
  ChevronIcon,
  DOWNLOAD_HREF,
  Footer,
  HandsTrustIllustration,
  IMG_MEETING,
  IMG_OFFICE,
  KanbanStacksIllustration,
  PRINCIPLES,
  PrimaryCta,
  SecondaryCta,
  SkyscraperIllustration,
  serifClassName,
  TEAM,
} from "./landing-parts";
import { Header } from "./marketing-header";

export function LandingExperience(): React.ReactElement {
  const copy = LANDING_COPY;
  return (
    <>
      <Header />
      <section className="mx-auto max-w-3xl px-6 pt-20 pb-8 text-center lg:px-8 lg:pt-28">
        <h1
          className={serifClassName(
            "text-balance text-[2.5rem] font-bold leading-[1.1] sm:text-6xl sm:leading-[1.05]",
          )}
        >
          {copy.headline}
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-[18px] leading-relaxed text-[var(--mk-muted)]">
          {copy.subhead}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PrimaryCta href={APP_HREF}>{copy.primaryCta}</PrimaryCta>
          <SecondaryCta href={DOWNLOAD_HREF}>{copy.secondaryCta}</SecondaryCta>
        </div>
      </section>
      <div className="mx-auto flex justify-center px-6 pb-16 lg:px-8 lg:pb-24">
        <SkyscraperIllustration className="max-h-[min(360px,40vh)] w-full max-w-sm text-[var(--mk-ink)] opacity-90" />
      </div>
      <div className="border-y border-[var(--mk-hairline)] bg-[var(--mk-surface)] py-16">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2">
            <p className={serifClassName("text-2xl font-medium sm:text-3xl")}>
              {copy.magazineLeadA ?? copy.valueA}
            </p>
            <p className="text-[17px] leading-relaxed text-[var(--mk-muted)]">
              {copy.magazineLeadB ?? copy.valueB}
            </p>
          </div>
        </div>
      </div>
      <Philosophy copy={copy} />
      <Trust copy={copy} />
      <Principles />
      <Team />
      <Careers reversed />
      <FinalCta copy={copy} />
      <Footer />
    </>
  );
}

function Philosophy({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 lg:px-8 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-16">
        <div className="relative min-h-[320px] overflow-hidden rounded-2xl lg:min-h-0">
          <Image
            src={IMG_OFFICE}
            alt="Two people collaborating at a desk in a modern office"
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority
          />
        </div>
        <div className="flex flex-col justify-between rounded-2xl bg-[var(--mk-beige)] p-10 lg:p-12">
          <div>
            <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl")}>
              {copy.philosophyHeading}
            </h2>
            <p className="mt-6 text-[16px] leading-[1.7] text-[var(--mk-muted)]">
              {copy.philosophyBody1}
            </p>
            {copy.philosophyBody2 ? (
              <p className="mt-4 text-[16px] leading-[1.7] text-[var(--mk-muted)]">
                {copy.philosophyBody2}
              </p>
            ) : null}
          </div>
          <Link
            href="#learn"
            className="mt-10 inline-flex h-11 w-fit items-center rounded-lg bg-[var(--mk-ink)] px-6 text-[14px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
          >
            How it works
          </Link>
        </div>
      </div>
    </section>
  );
}

function Trust({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-8">
        <p className="text-balance text-xl font-medium leading-snug lg:text-right lg:text-2xl">
          {copy.trustHeadA}
        </p>
        <HandsTrustIllustration className="mx-auto h-auto w-full max-w-[280px] text-[var(--mk-ink)] lg:max-w-[320px]" />
        <p className="text-balance text-xl font-medium leading-snug lg:text-2xl">
          {copy.trustHeadB ?? copy.trustHeadA}
        </p>
      </div>
      <p className="mx-auto mt-12 max-w-2xl text-center text-[15px] leading-relaxed text-[var(--mk-muted)]">
        {copy.trustBody}
      </p>
    </section>
  );
}

function Principles(): React.ReactElement {
  return (
    <section id="learn" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 lg:px-8 lg:py-24">
      <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="flex flex-col items-start">
          <BustIllustration className="mb-10 w-32 text-[var(--mk-ink)]" />
          <h2 className={serifClassName("max-w-sm text-3xl font-semibold sm:text-4xl")}>
            How we think about Planbooq
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
  );
}

function Team(): React.ReactElement {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
      <h2 className="mx-auto max-w-3xl text-balance text-center text-xl font-medium leading-snug sm:text-2xl">
        Meet the folks obsessed with parallel, human-friendly shipping.
      </h2>
      <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM.map((m) => (
          <article key={m.name} className="flex flex-col">
            <div>
              <p className="text-[15px] font-semibold">{m.name}</p>
              <p className="mt-0.5 text-[14px] text-[var(--mk-muted)]">{m.title}</p>
            </div>
            <div className="relative mt-5 aspect-[3/4] overflow-hidden rounded-xl">
              <Image
                src={m.image}
                alt={m.alt}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 33vw, 50vw"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Careers({ reversed }: { reversed?: boolean }): React.ReactElement {
  const text = (
    <div>
      <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl")}>
        Apply to join our team
      </h2>
      <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--mk-muted)]">
        Tell us what you would tighten: we are always hunting for people who like fast, clear
        workflows—engineering chops optional, taste required.
      </p>
      <a
        href="mailto:hello@planbooq.app"
        className="mt-8 inline-flex h-12 items-center rounded-lg bg-[var(--mk-ink)] px-8 text-[15px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
      >
        Apply
      </a>
    </div>
  );
  const image = (
    <div className="relative min-h-[280px] overflow-hidden rounded-2xl lg:min-h-[360px]">
      <Image
        src={IMG_MEETING}
        alt="Team meeting viewed from behind seated participants"
        fill
        className="object-cover"
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
    </div>
  );
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        {reversed ? (
          <>
            {image}
            {text}
          </>
        ) : (
          <>
            {text}
            {image}
          </>
        )}
      </div>
    </section>
  );
}

function FinalCta({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl lg:text-5xl")}>
            {copy.finalHeading}
          </h2>
          <PrimaryCta href={APP_HREF} className="mt-10">
            {copy.primaryCta}
          </PrimaryCta>
        </div>
        <div className="flex justify-center lg:justify-end">
          <KanbanStacksIllustration className="max-h-[200px] w-full max-w-[240px] text-[var(--mk-ink)]" />
        </div>
      </div>
    </section>
  );
}

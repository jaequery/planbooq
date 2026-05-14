"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LANDING_COPY_VARIANTS,
  LANDING_VARIANT_COUNT,
  type LandingCopy,
  type LandingVariant,
  type LandingVariantIndex,
} from "./landing-copy-variants";
import {
  APP_HREF,
  BullIllustration,
  BustIllustration,
  ChevronIcon,
  DOWNLOAD_HREF,
  Footer,
  HandsTrustIllustration,
  IMG_MEETING,
  IMG_OFFICE,
  KanbanStacksIllustration,
  NitroKanbanIllustration,
  PRINCIPLES,
  PrimaryCta,
  SecondaryCta,
  SkyscraperIllustration,
  serifClassName,
  TEAM,
} from "./landing-parts";
import { Header } from "./marketing-header";

const STORAGE_KEY = "planbooqLandingVariation";
const DEFAULT_VARIATION: LandingVariantIndex = 8;

export { LANDING_COPY_VARIANTS };

export function LandingExperience(): React.ReactElement {
  const [variation, setVariation] = useState<LandingVariantIndex>(DEFAULT_VARIATION);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = Number.parseInt(raw, 10);
        if (Number.isFinite(n) && n >= 0 && n < LANDING_VARIANT_COUNT) {
          setVariation(n as LandingVariantIndex);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(variation));
    } catch {
      /* ignore */
    }
  }, [variation, mounted]);

  const active: LandingVariant = LANDING_COPY_VARIANTS[variation];

  return (
    <>
      <FloatingVariationSwitcher variation={variation} onChange={setVariation} />
      {renderLayout(active)}
    </>
  );
}

function renderLayout(variant: LandingVariant): React.ReactElement {
  switch (variant.layout) {
    case "classic":
      return <LandingClassic copy={variant.copy} />;
    case "noir":
      return <LandingNoir copy={variant.copy} />;
    case "magazine":
      return <LandingMagazine copy={variant.copy} />;
    case "alternate":
      return <LandingAlternate copy={variant.copy} />;
    case "editorial":
      return <LandingEditorial copy={variant.copy} />;
  }
}

function FloatingVariationSwitcher({
  variation,
  onChange,
}: {
  variation: LandingVariantIndex;
  onChange: (v: LandingVariantIndex) => void;
}): React.ReactElement {
  return (
    <section
      className="fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2 sm:bottom-8 sm:right-8"
      aria-label="Landing copy variations"
    >
      <div
        className="rounded-2xl border px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md"
        style={{
          borderColor: "var(--mk-hairline-strong)",
          backgroundColor: "color-mix(in srgb, var(--mk-bg) 92%, transparent)",
        }}
      >
        <p
          className="mb-2 px-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase"
          style={{ color: "var(--mk-muted)" }}
        >
          Themes
        </p>
        <div className="flex max-w-[260px] flex-wrap justify-end gap-1">
          {LANDING_COPY_VARIANTS.map((v, i) => {
            const active = variation === i;
            return (
              <button
                key={v.id}
                type="button"
                title={v.label}
                aria-pressed={active}
                aria-label={`${v.label}, theme ${i + 1} of ${LANDING_VARIANT_COUNT}`}
                onClick={() => onChange(i as LandingVariantIndex)}
                className="flex h-8 min-w-8 items-center justify-center rounded-md text-[12px] font-semibold transition"
                style={{
                  backgroundColor: active ? "var(--mk-ink)" : "transparent",
                  color: active ? "var(--mk-bg)" : "var(--mk-ink)",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <p
          className="mt-2 max-w-[220px] text-right text-[11px] leading-snug"
          style={{ color: "var(--mk-muted)" }}
        >
          {LANDING_COPY_VARIANTS[variation].label}
        </p>
      </div>
    </section>
  );
}

/* ——— Variation: Classic (split hero) ——— */

function LandingClassic({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <>
      <Header />
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <h1
            className={serifClassName(
              "text-balance text-[2.35rem] font-bold leading-[1.12] sm:text-5xl lg:text-[3.25rem]",
            )}
          >
            {copy.headline}
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-[var(--mk-muted)]">
            {copy.subhead}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <PrimaryCta href={APP_HREF}>{copy.primaryCta}</PrimaryCta>
            <SecondaryCta href={DOWNLOAD_HREF}>{copy.secondaryCta}</SecondaryCta>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <SkyscraperIllustration className="max-h-[min(420px,50vh)] w-full max-w-md text-[var(--mk-ink)]" />
        </div>
      </section>
      <ValueLines a={copy.valueA} b={copy.valueB} />
      <Philosophy imageFirst={false} copy={copy} />
      <Trust copy={copy} />
      <Principles />
      <Team centered />
      <Careers />
      <FinalCta illustration="bull" copy={copy} />
      <Footer />
    </>
  );
}

/* ——— Variation: Noir hero band ——— */

function LandingNoir({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <>
      <Header />
      <div className="bg-[var(--mk-ink)] text-[var(--mk-bg)]">
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-28">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-white/50 uppercase">
              {copy.eyebrow ?? "One harness"}
            </p>
            <h1
              className={serifClassName(
                "mt-4 text-balance text-[2.35rem] font-bold leading-[1.12] sm:text-5xl lg:text-[3.25rem]",
              )}
            >
              {copy.headline}
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/70">
              {copy.subhead}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PrimaryCta href={APP_HREF} inverted>
                {copy.primaryCta}
              </PrimaryCta>
              <SecondaryCta href={DOWNLOAD_HREF} inverted>
                {copy.secondaryCta}
              </SecondaryCta>
            </div>
          </div>
          <div className="flex justify-center text-[var(--mk-bg)] lg:justify-end">
            <KanbanStacksIllustration className="max-h-[min(400px,48vh)] w-full max-w-sm opacity-90" />
          </div>
        </section>
      </div>
      <div className="bg-[var(--mk-beige)]">
        <ValueLines a={copy.valueA} b={copy.valueB} />
      </div>
      <Philosophy imageFirst={false} copy={copy} />
      <Trust copy={copy} />
      <Principles />
      <Team centered />
      <Careers />
      <FinalCta illustration="bull" copy={copy} />
      <Footer />
    </>
  );
}

/* ——— Variation: Magazine (stacked hero, swapped philosophy) ——— */

function LandingMagazine({ copy }: { copy: LandingCopy }): React.ReactElement {
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
      <Philosophy imageFirst copy={copy} />
      <Trust copy={copy} />
      <Principles />
      <Team centered={false} />
      <Careers reversed />
      <FinalCta illustration="kanban" copy={copy} />
      <Footer />
    </>
  );
}

/* ——— Variation: Alternating full-bleed stripes ——— */

function LandingAlternate({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <>
      <Header />
      <section className="grid lg:min-h-[min(85vh,820px)] lg:grid-cols-2">
        <div className="flex flex-col justify-center bg-[var(--mk-beige)] px-6 py-20 lg:px-12 lg:py-24">
          <h1
            className={serifClassName(
              "max-w-xl text-balance text-[2.4rem] font-bold leading-[1.08] sm:text-5xl lg:text-[3.1rem]",
            )}
          >
            {copy.headline}
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[var(--mk-muted)]">
            {copy.subhead}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <PrimaryCta href={APP_HREF}>{copy.primaryCta}</PrimaryCta>
            <SecondaryCta href={DOWNLOAD_HREF}>{copy.secondaryCta}</SecondaryCta>
          </div>
        </div>
        <div className="relative flex min-h-[320px] items-center justify-center bg-[var(--mk-bg)] px-6 py-10 lg:min-h-0 lg:px-10 lg:py-14">
          <div className="relative w-full max-w-[min(100%,520px)]">
            <p className="sr-only">
              Stylized Planbooq board: backlog through shipped lanes, Building boosted like a nitro
              lane with agents running—signal that AI accelerates shipping, not just another static
              kanban snapshot.
            </p>
            <NitroKanbanIllustration className="h-auto w-full text-[var(--mk-ink)]" />
          </div>
        </div>
      </section>
      <div className="bg-[var(--mk-bg)]">
        <ValueLines a={copy.valueA} b={copy.valueB} />
      </div>
      <div className="bg-[var(--mk-beige)] py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <PhilosophyInline copy={copy} />
        </div>
      </div>
      <div className="bg-[var(--mk-bg)] py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <TrustStacked copy={copy} />
        </div>
      </div>
      <div className="bg-[var(--mk-beige)] py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <PrinciplesCards />
        </div>
      </div>
      <div className="bg-[var(--mk-bg)]">
        <Team centered />
      </div>
      <div className="bg-[var(--mk-beige)]">
        <Careers />
      </div>
      <div className="bg-[var(--mk-bg)]">
        <FinalCta illustration="bull" copy={copy} />
      </div>
      <Footer />
    </>
  );
}

function PhilosophyInline({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
      <div className="relative min-h-[280px] overflow-hidden rounded-2xl lg:order-2 lg:min-h-[360px]">
        <Image
          src={IMG_OFFICE}
          alt="Collaboration in a modern office"
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 40vw, 100vw"
        />
      </div>
      <div className="lg:order-1">
        <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl")}>
          {copy.philosophyHeading}
        </h2>
        <p className="mt-6 text-[16px] leading-[1.7] text-[var(--mk-muted)]">
          {copy.philosophyBody1}
        </p>
        <Link
          href="#learn"
          className="mt-8 inline-flex h-11 w-fit items-center rounded-lg bg-[var(--mk-ink)] px-6 text-[14px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
        >
          How it works
        </Link>
      </div>
    </div>
  );
}

function TrustStacked({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <div className="flex flex-col items-center text-center">
      <HandsTrustIllustration className="mb-10 h-auto w-full max-w-[240px] text-[var(--mk-ink)]" />
      <p className={serifClassName("max-w-2xl text-2xl font-medium sm:text-3xl")}>
        {copy.trustHeadA}
      </p>
      <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[var(--mk-muted)]">
        {copy.trustBody}
      </p>
    </div>
  );
}

function PrinciplesCards(): React.ReactElement {
  return (
    <div>
      <h2
        className={serifClassName(
          "mx-auto max-w-xl text-center text-3xl font-semibold sm:text-4xl",
        )}
      >
        Principles
      </h2>
      <ul className="mt-12 grid gap-4 sm:grid-cols-3">
        {PRINCIPLES.map((line) => (
          <li
            key={line}
            className="rounded-2xl border border-[var(--mk-hairline)] bg-[var(--mk-bg)] p-6 text-[15px] font-medium leading-snug"
          >
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex justify-center">
        <Link
          href={APP_HREF}
          className="inline-flex h-11 items-center rounded-lg bg-[var(--mk-ink)] px-6 text-[14px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
        >
          Start building
        </Link>
      </div>
    </div>
  );
}

/* ——— Variation: Editorial tight rhythm ——— */

function LandingEditorial({ copy }: { copy: LandingCopy }): React.ReactElement {
  return (
    <>
      <Header />
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 lg:px-8 lg:pt-24">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h1
            className={serifClassName(
              "max-w-[18ch] text-[2.6rem] font-bold leading-[1.05] sm:text-6xl lg:text-[4rem]",
            )}
          >
            {copy.headline}
          </h1>
          <p className="max-w-md text-[17px] leading-relaxed text-[var(--mk-muted)] lg:pb-2">
            {copy.subhead}
          </p>
        </div>
        <div className="mt-10 flex flex-wrap gap-4 border-t border-[var(--mk-hairline)] pt-10">
          <PrimaryCta href={APP_HREF}>{copy.primaryCta}</PrimaryCta>
          <SecondaryCta href={DOWNLOAD_HREF}>{copy.secondaryCta}</SecondaryCta>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="flex items-center justify-center border border-[var(--mk-hairline)] bg-[var(--mk-surface)] py-16">
          <BullIllustration className="h-40 w-48 text-[var(--mk-ink)]" />
        </div>
      </div>
      <section className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
        <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[var(--mk-accent)] uppercase">
          Why people switch
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <p className="text-[22px] font-medium leading-snug tracking-[-0.02em]">
            {copy.editorialA ?? copy.valueA}
          </p>
          <p className="text-[22px] font-medium leading-snug tracking-[-0.02em]">
            {copy.editorialB ?? copy.valueB}
          </p>
        </div>
      </section>
      <Philosophy imageFirst={false} copy={copy} />
      <div className="border-t border-[var(--mk-hairline)]">
        <Principles />
      </div>
      <Team centered />
      <section className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
        <div className="grid gap-10 rounded-2xl bg-[var(--mk-beige)] p-10 lg:grid-cols-2 lg:items-center lg:p-14">
          <div>
            <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl")}>
              {copy.editorialReadyHead ?? "Ready when you are."}
            </h2>
            <p className="mt-4 text-[16px] text-[var(--mk-muted)]">
              {copy.editorialReadyBody ??
                "Hiring, side project, or full sprint—same ritual: open the board, start the next lane."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="mailto:hello@planbooq.app"
                className="inline-flex h-12 items-center rounded-lg border border-[var(--mk-hairline-strong)] bg-[var(--mk-bg)] px-6 text-[15px] font-medium transition hover:opacity-90"
              >
                Apply
              </a>
              <PrimaryCta href={APP_HREF}>{copy.primaryCta}</PrimaryCta>
            </div>
          </div>
          <div className="relative min-h-[220px] overflow-hidden rounded-xl">
            <Image
              src={IMG_MEETING}
              alt="Team meeting in a conference room"
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 40vw, 100vw"
            />
          </div>
        </div>
      </section>
      <FinalCta illustration="kanban" copy={copy} />
      <Footer />
    </>
  );
}

/* ——— Shared sections ——— */

function ValueLines({ a, b }: { a: string; b: string }): React.ReactElement {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
        <p className="text-balance text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl lg:text-[2rem]">
          {a}
        </p>
        <p className="text-balance text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl lg:text-[2rem]">
          {b}
        </p>
      </div>
    </section>
  );
}

function Philosophy({
  imageFirst,
  copy,
}: {
  imageFirst: boolean;
  copy: LandingCopy;
}): React.ReactElement {
  const text = (
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
  );
  const photo = (
    <div className="relative min-h-[320px] overflow-hidden rounded-2xl lg:min-h-0">
      <Image
        src={IMG_OFFICE}
        alt="Two people collaborating at a desk in a modern office"
        fill
        className="object-cover"
        sizes="(min-width: 1024px) 50vw, 100vw"
        priority={!imageFirst}
      />
    </div>
  );
  return (
    <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 lg:px-8 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-16">
        {imageFirst ? (
          <>
            {photo}
            {text}
          </>
        ) : (
          <>
            {text}
            {photo}
          </>
        )}
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

function Team({ centered }: { centered: boolean }): React.ReactElement {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
      <h2
        className={`max-w-3xl text-xl font-medium leading-snug sm:text-2xl ${centered ? "mx-auto text-balance text-center" : "text-left"}`}
      >
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

function FinalCta({
  illustration,
  copy,
}: {
  illustration: "bull" | "kanban";
  copy: LandingCopy;
}): React.ReactElement {
  const art =
    illustration === "bull" ? (
      <BullIllustration className="max-h-[200px] w-full max-w-[220px] text-[var(--mk-ink)]" />
    ) : (
      <KanbanStacksIllustration className="max-h-[200px] w-full max-w-[240px] text-[var(--mk-ink)]" />
    );
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
        <div className="flex justify-center lg:justify-end">{art}</div>
      </div>
    </section>
  );
}

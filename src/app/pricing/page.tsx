import { Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import {
  Footer,
  PrimaryCta,
  SecondaryCta,
  serifClassName,
} from "../(marketing)/_components/landing-parts";
import { Header } from "../(marketing)/_components/marketing-header";

const landingSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-landing-serif",
});

export const metadata = {
  title: "Pricing — Planbooq",
  description:
    "Two plans, one surface. Start free with 1,000 tickets per month, or go unlimited on Premium for $20/month.",
};

type Plan = {
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    tagline: "For solo builders kicking the tires on parallel shipping.",
    price: "$0",
    cadence: "forever",
    features: [
      "1,000 tickets per month",
      "Unlimited workspaces and projects",
      "Bring-your-own Claude API key",
      "Kanban board, branches, and worktrees",
      "Community support",
    ],
    cta: { label: "Get started free", href: "/welcome" },
    highlighted: false,
  },
  {
    name: "Premium",
    tagline: "For teams keeping many tickets in flight every day.",
    price: "$20",
    cadence: "per month",
    features: [
      "Unlimited tickets",
      "Unlimited workspaces and projects",
      "Bring-your-own Claude API key",
      "Priority support",
      "Early access to hosted compute",
    ],
    cta: { label: "Upgrade to Premium", href: "/welcome" },
    highlighted: true,
  },
];

const FAQ = [
  {
    q: "What happens if I hit 1,000 tickets on Free?",
    a: "New tickets pause for the rest of the billing month. Existing tickets keep moving — nothing is locked or deleted.",
  },
  {
    q: "Do I need to bring my own API key?",
    a: "Yes. Both plans use your own Claude API key, so model spend stays on your bill. Hosted compute is on the roadmap for Premium.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Premium is month-to-month — cancel whenever, and you drop back to Free at the end of the billing period.",
  },
];

export default function PricingPage(): React.ReactElement {
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
          Simple pricing. One terminal at a time is broken.
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-[18px] leading-relaxed text-[var(--mk-muted)]">
          Start free with 1,000 tickets per month. When you need more, Premium unlocks unlimited
          tickets for $20 — no per-seat math, no surprise overages.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 lg:px-8 lg:pb-28">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {PLANS.map((plan) => (
            <PricingTier key={plan.name} plan={plan} />
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--mk-hairline)] bg-[var(--mk-surface)] py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl")}>Common questions</h2>
          <dl className="mt-10 flex flex-col divide-y divide-[var(--mk-hairline-strong)]">
            {FAQ.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="text-[16px] font-semibold">{item.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-[var(--mk-muted)]">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center lg:px-8 lg:py-28">
        <h2 className={serifClassName("text-3xl font-semibold sm:text-4xl lg:text-5xl")}>
          Keep ten tickets moving at once.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--mk-muted)]">
          Spin up the kanban, point it at a repo, and start shipping. You can always upgrade later.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PrimaryCta href="/welcome">Start building</PrimaryCta>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function PricingTier({ plan }: { plan: Plan }): React.ReactElement {
  const Cta = plan.highlighted ? PrimaryCta : SecondaryCta;
  return (
    <article
      className={`flex h-full flex-col rounded-2xl border p-8 sm:p-10 ${
        plan.highlighted
          ? "border-transparent bg-[var(--mk-ink)] text-[var(--mk-bg)]"
          : "border-[var(--mk-hairline-strong)] bg-[var(--mk-surface)] text-[var(--mk-ink)]"
      }`}
    >
      <header>
        <h2
          className={serifClassName(
            `text-3xl font-semibold sm:text-4xl ${plan.highlighted ? "text-[var(--mk-bg)]" : ""}`,
          )}
        >
          {plan.name}
        </h2>
        <p
          className={`mt-3 text-[15px] leading-relaxed ${
            plan.highlighted ? "text-white/70" : "text-[var(--mk-muted)]"
          }`}
        >
          {plan.tagline}
        </p>
      </header>

      <div className="mt-8 flex items-baseline gap-2">
        <span className={serifClassName("text-5xl font-bold leading-none sm:text-6xl")}>
          {plan.price}
        </span>
        <span
          className={`text-[14px] ${plan.highlighted ? "text-white/70" : "text-[var(--mk-muted)]"}`}
        >
          {plan.cadence}
        </span>
      </div>

      <ul
        className={`mt-8 flex flex-col gap-3 text-[15px] ${
          plan.highlighted ? "text-white/85" : "text-[var(--mk-ink)]"
        }`}
      >
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <CheckIcon
              className={`mt-1 h-4 w-4 shrink-0 ${
                plan.highlighted ? "text-white/80" : "text-[var(--mk-ink)]"
              }`}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 pt-2">
        <Cta href={plan.cta.href} inverted={plan.highlighted} className="w-full justify-center">
          {plan.cta.label}
        </Cta>
      </div>

      {plan.highlighted ? null : (
        <p className="mt-4 text-[12px] text-[var(--mk-muted)]">
          <Link href="#" className="underline-offset-2 hover:underline">
            Compare plans
          </Link>{" "}
          · No credit card required
        </p>
      )}
    </article>
  );
}

function CheckIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.2 3 6.8-7" />
    </svg>
  );
}

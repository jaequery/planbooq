import Link from "next/link";
import { Button } from "@/components/ui/button";

type Plan = {
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  cta: string;
  benefits: string[];
  features: Record<string, string | boolean>;
};

const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "variants", label: "Parallel AI variants per ticket" },
  { key: "previews", label: "Live preview URLs" },
  { key: "screenshots", label: "Auto screenshots & diffs" },
  { key: "byok", label: "Bring your own API keys" },
  { key: "hosted", label: "Hosted compute included" },
  { key: "projects", label: "Projects" },
  { key: "members", label: "Team members" },
  { key: "history", label: "Taste history & learning" },
  { key: "api", label: "REST API + Claude skills" },
  { key: "support", label: "Support" },
];

const PLANS: Plan[] = [
  {
    name: "Hobby",
    tagline: "Solo vibe coders, weekend builds.",
    price: "$0",
    cadence: "forever",
    cta: "Start free",
    benefits: [
      "Unlimited tickets on personal workspace",
      "Run variants on your own API keys",
      "Public preview URLs",
    ],
    features: {
      variants: "Up to 2 / ticket",
      previews: true,
      screenshots: true,
      byok: true,
      hosted: false,
      projects: "3",
      members: "1",
      history: "30 days",
      api: true,
      support: "Community",
    },
  },
  {
    name: "Pro",
    tagline: "For builders shipping every day.",
    price: "$24",
    cadence: "per user / month",
    highlight: true,
    cta: "Start Pro trial",
    benefits: [
      "Up to 8 parallel variants per ticket",
      "Hosted compute credits each month",
      "Taste-learning that compounds across projects",
    ],
    features: {
      variants: "Up to 8 / ticket",
      previews: true,
      screenshots: true,
      byok: true,
      hosted: "Included credits",
      projects: "Unlimited",
      members: "Up to 10",
      history: "Unlimited",
      api: true,
      support: "Priority email",
    },
  },
  {
    name: "Team",
    tagline: "Studios and product teams running in parallel.",
    price: "Custom",
    cadence: "billed annually",
    cta: "Contact sales",
    benefits: [
      "SSO, audit logs, and role-based access",
      "Pooled hosted compute with usage caps",
      "Dedicated onboarding & solution engineer",
    ],
    features: {
      variants: "Unlimited",
      previews: true,
      screenshots: true,
      byok: true,
      hosted: "Pooled + caps",
      projects: "Unlimited",
      members: "Unlimited",
      history: "Unlimited + export",
      api: true,
      support: "Dedicated SE",
    },
  },
];

function Cell({ value }: { value: string | boolean }): React.ReactElement {
  if (value === true) {
    return <span className="text-foreground">Included</span>;
  }
  if (value === false) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="text-foreground">{value}</span>;
}

export default function ComparePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Compare plans
          </p>
          <h1 className="mt-3 font-mono text-4xl font-semibold tracking-tight sm:text-5xl">
            Pick the plan that fans out with you
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Every plan ships parallel AI variants, live previews, and pick-don't-prompt review.
            Scale up when you need more variants, more seats, or hosted compute.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-xl border p-6 ${
                plan.highlight
                  ? "border-foreground/40 bg-foreground/[0.03] shadow-sm"
                  : "border-border/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-lg font-semibold">{plan.name}</h2>
                {plan.highlight ? (
                  <span className="rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-background">
                    Popular
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-semibold tracking-tight">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground">{plan.cadence}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2">
                    <span aria-hidden="true" className="text-foreground">
                      ✓
                    </span>
                    <span className="text-muted-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Button asChild className="w-full" variant={plan.highlight ? "default" : "outline"}>
                  <Link href="/">{plan.cta}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <section aria-labelledby="features-heading" className="mt-20">
          <h2 className="font-mono text-2xl font-semibold tracking-tight" id="features-heading">
            Feature comparison
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Side-by-side breakdown of what each plan unlocks.
          </p>

          <div className="mt-8 hidden overflow-hidden rounded-xl border border-border/60 sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="w-1/3 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Feature
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      className="px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      key={plan.name}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row, i) => (
                  <tr className={i % 2 === 0 ? "bg-background" : "bg-muted/20"} key={row.key}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                    {PLANS.map((plan) => (
                      <td className="px-4 py-3" key={`${plan.name}-${row.key}`}>
                        <Cell value={plan.features[row.key] ?? false} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 space-y-4 sm:hidden">
            {PLANS.map((plan) => (
              <div className="rounded-xl border border-border/60 p-4" key={plan.name}>
                <h3 className="font-mono text-base font-semibold">{plan.name}</h3>
                <dl className="mt-3 divide-y divide-border/60">
                  {FEATURE_ROWS.map((row) => (
                    <div className="flex justify-between gap-4 py-2 text-sm" key={row.key}>
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="text-right">
                        <Cell value={plan.features[row.key] ?? false} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-xl border border-border/60 p-8 text-center">
          <h2 className="font-mono text-xl font-semibold tracking-tight">
            Not sure which plan fits?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Start on Hobby with your own API keys. Upgrade once parallel variants and hosted compute
            start saving you real time.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link href="/">Get started free</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="mailto:hello@planbooq.com">Talk to us</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

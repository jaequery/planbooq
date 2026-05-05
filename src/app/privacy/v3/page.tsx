export const metadata = { title: "Privacy Policy — Planbooq" };

const EFFECTIVE = "May 5, 2026";

const TLDR = [
  { k: "We collect", v: "Email, GitHub handle, your tickets/prompts/variants, basic usage logs." },
  { k: "We don't", v: "Sell your data. Train third-party models on your prompts. Read repo code we don't need." },
  { k: "BYOK", v: "Your prompts go to the provider you configured. We relay, we don't retain bodies." },
  { k: "Delete", v: "Settings → Account → Delete. Gone from primary storage in 30 days." },
  { k: "Contact", v: "privacy@planbooq.com" },
];

const FULL = [
  ["Data collected", "Account (email, name, GitHub), workspace content (tickets, prompts, variants, attachments), usage telemetry (events, errors, IP), billing metadata via Stripe."],
  ["Purpose", "Run the service, authenticate, fan out variants, bill you, prevent abuse, improve the product."],
  ["AI providers", "BYOK requests are relayed directly to your configured provider. Hosted compute uses our keys under the same terms. Provider training opt-out is enabled by default where supported."],
  ["Subprocessors", "Hosting, email delivery, analytics, error reporting, payments. List on request."],
  ["Retention", "Workspace data persists until deletion. Logs ≤ 90 days. Backups purged within 90 days of deletion."],
  ["Security", "TLS in transit, encryption at rest, audited production access, breach notification without undue delay."],
  ["Your rights", "Access, export, correct, delete — most self-serve in Settings, otherwise privacy@planbooq.com (≤ 30 day response)."],
  ["Changes", "Material changes announced ≥ 14 days before effective date."],
];

export default function PrivacyV3(): React.ReactElement {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">privacy.md</h1>
        <span className="font-mono text-xs text-muted-foreground">eff. {EFFECTIVE}</span>
      </header>

      <section className="mt-8 rounded-xl border border-border/60 bg-muted/30 p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          TL;DR
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
          {TLDR.map((row) => (
            <div key={row.k} className="contents">
              <dt className="font-mono text-xs font-semibold text-foreground/80 sm:text-right">
                {row.k}
              </dt>
              <dd className="text-sm text-foreground/90">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-muted-foreground">
          # Full text
        </h2>
        <div className="mt-6 divide-y divide-border/60">
          {FULL.map(([title, body]) => (
            <details key={title} className="group py-4" open>
              <summary className="cursor-pointer list-none font-mono text-sm font-semibold tracking-tight">
                <span className="text-muted-foreground group-open:hidden">▸ </span>
                <span className="hidden text-muted-foreground group-open:inline">▾ </span>
                {title}
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{body}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-border/60 pt-6 font-mono text-xs text-muted-foreground">
        Questions → privacy@planbooq.com
      </footer>
    </main>
  );
}

export const metadata = { title: "Privacy Policy — Planbooq" };

const EFFECTIVE = "May 5, 2026";

export default function PrivacyV1(): React.ReactElement {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="border-b border-border/60 pb-6">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective {EFFECTIVE}</p>
      </header>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed">
        <Section title="1. What we collect">
          Account data (email, name, GitHub handle), workspace and project content you create,
          and basic usage telemetry (page views, errors). When you connect a repo, we read
          metadata required to spawn variants — we do not read source we do not need.
        </Section>

        <Section title="2. Why we collect it">
          To run the product, route AI variants, bill you, and improve the service. We do not
          sell personal data.
        </Section>

        <Section title="3. AI providers">
          When you use BYOK, prompts go directly to the provider you configured (e.g. Anthropic,
          OpenAI). On hosted compute, prompts pass through our infrastructure under the same
          provider terms. We never use your prompts to train third-party models.
        </Section>

        <Section title="4. Sharing">
          We share data with infrastructure subprocessors (hosting, email, analytics, error
          tracking, payments). A current list is available on request.
        </Section>

        <Section title="5. Retention">
          Workspace content persists until you delete it or close your account. Logs are kept
          up to 90 days.
        </Section>

        <Section title="6. Your rights">
          Access, export, correct, or delete your data at any time from Settings, or by
          emailing privacy@planbooq.com.
        </Section>

        <Section title="7. Contact">
          Questions: privacy@planbooq.com.
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section>
      <h2 className="font-mono text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </section>
  );
}

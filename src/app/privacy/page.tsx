import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Planbooq",
  description: "How Planbooq collects, uses, and protects your data.",
};

const EFFECTIVE_DATE = "May 5, 2026";

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-10">
        <Link
          href="/"
          className="font-mono text-[13px] text-muted-foreground hover:text-foreground"
        >
          ← Planbooq
        </Link>
      </div>

      <h1 className="font-mono text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90">
        <section>
          <p>
            Planbooq is a kanban platform for parallel AI code generation. This policy explains
            what we collect, how we use it, and the choices you have. We've kept it short and
            specific to how the product actually works.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">The two things that matter most</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>We do not train models on your code, prompts, tickets, or attachments.</strong>{" "}
              Your workspace content is used to run the product for you — nothing else.
            </li>
            <li>
              <strong>Your bring-your-own-key (BYOK) API keys are encrypted at rest</strong>,
              scoped to your workspace, used only to execute jobs you initiate, and never logged
              in plaintext.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">What we collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>Account data:</strong> email address, and (if you sign in with GitHub) your
              GitHub username, display name, and avatar.
            </li>
            <li>
              <strong>Workspace content:</strong> projects, tickets, labels, statuses, comments,
              and file attachments you upload. Treated as confidential to your workspace.
            </li>
            <li>
              <strong>AI artifacts:</strong> prompts you submit, generated variants, diffs,
              preview URLs, and screenshots produced by jobs you run.
            </li>
            <li>
              <strong>Provider keys (BYOK):</strong> API keys you supply for third-party AI
              providers, stored encrypted.
            </li>
            <li>
              <strong>Operational telemetry:</strong> server logs, IP address, user agent, and
              basic usage events used to secure and debug the service.
            </li>
            <li>
              <strong>Cookies:</strong> a strictly necessary session cookie for authentication.
              We do not use advertising cookies.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">How we use it</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>To provide the service: render your kanban, run AI jobs you initiate, deliver realtime updates, and store your attachments.</li>
            <li>To send transactional email (sign-in links, security notifications).</li>
            <li>To secure the platform, prevent abuse, and debug incidents.</li>
            <li>To improve the product in aggregate — never by reading your workspace content.</li>
          </ul>
          <p className="mt-3">
            We do not sell your data. We do not share it with advertisers. We do not use your
            content to train AI models, our own or anyone else's.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Sub-processors</h2>
          <p className="mt-3">
            We rely on a small set of infrastructure providers to operate Planbooq. Each receives
            only the data needed to perform its function:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li><strong>Hosting:</strong> our application host (compute, edge, CDN).</li>
            <li><strong>Database:</strong> managed Postgres provider.</li>
            <li><strong>Object storage:</strong> S3-compatible provider for attachments.</li>
            <li><strong>Realtime:</strong> Ably (workspace event delivery).</li>
            <li><strong>Background jobs:</strong> Inngest.</li>
            <li><strong>Email:</strong> SMTP provider for transactional mail.</li>
            <li><strong>AI providers:</strong> when not using BYOK, the model provider (e.g. Anthropic, OpenAI) processes the prompt to generate a response.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Sharing</h2>
          <p className="mt-3">
            Workspace content is visible to members of that workspace. We do not share data with
            third parties beyond the sub-processors above. We may disclose information when
            legally required, and will push back on overbroad requests where we can.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Retention &amp; deletion</h2>
          <p className="mt-3">
            We keep your data while your account is active. When you delete your account, we
            remove your workspace content from production systems within 30 days. Encrypted
            backups are purged on a rolling 90-day cycle.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Your rights</h2>
          <p className="mt-3">
            You can access, export, correct, or delete your data at any time. If you're in the
            EU/UK or California, you have additional rights under GDPR/UK GDPR and the CCPA,
            including the right to object to processing and to lodge a complaint with your
            supervisory authority. To exercise any of these, email us at the address below.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Security</h2>
          <p className="mt-3">
            Data is encrypted in transit (TLS) and at rest. Access to production systems is
            scoped, audited, and limited to engineers who need it. BYOK keys are encrypted with
            keys held outside the application database.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">International transfers</h2>
          <p className="mt-3">
            Planbooq's infrastructure may process data in the United States and the European
            Union. Where required, we use standard contractual clauses with our sub-processors.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Children</h2>
          <p className="mt-3">
            Planbooq is not directed at children under 16, and we do not knowingly collect data
            from them.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Changes</h2>
          <p className="mt-3">
            If we make material changes to this policy, we'll notify you by email and update the
            effective date above.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold tracking-tight">Contact</h2>
          <p className="mt-3">
            Questions, requests, or concerns: <a className="underline" href="mailto:privacy@planbooq.com">privacy@planbooq.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}

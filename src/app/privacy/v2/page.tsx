export const metadata = { title: "Privacy Policy — Planbooq" };

const EFFECTIVE = "May 5, 2026";

const SECTIONS = [
  {
    id: "introduction",
    title: "Introduction",
    body: `Planbooq ("we", "us") provides a kanban platform for parallel AI code generation. This Privacy Policy explains what personal information we collect, how we use it, and the choices you have. By using Planbooq you agree to the practices described here.`,
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    body: `Account information you provide when signing in with GitHub or magic link (email, name, avatar, GitHub username). Workspace and project content you author within Planbooq, including tickets, prompts, variants, comments, and attachments. Usage data such as device type, browser, IP address, and interaction events. Billing details when you subscribe — handled by our payment processor; we never store full card numbers.`,
  },
  {
    id: "ai-and-byok",
    title: "AI providers and bring-your-own-key",
    body: `Spawning variants sends prompt data to an AI provider. When you bring your own key, requests are made directly to that provider under your account; we relay them but do not retain prompt bodies beyond what is needed to display results in your workspace. On hosted compute, the same applies but billed through us. We do not permit providers to use your prompts to train their models where opt-out is available, and we configure that opt-out by default.`,
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    body: `To operate Planbooq, authenticate you, deliver variants, send transactional email, prevent abuse, comply with legal obligations, and improve the product. Aggregated and de-identified data may be used to study which kinds of prompts produce which kinds of outcomes — this signal never leaves Planbooq in a form tied to your identity.`,
  },
  {
    id: "sharing",
    title: "Sharing and subprocessors",
    body: `We share data with subprocessors that help us run the service: cloud hosting, transactional email, analytics, error reporting, and payments. We require each to handle data under terms at least as protective as ours. We do not sell personal data and do not share it for cross-context behavioral advertising.`,
  },
  {
    id: "retention",
    title: "Data retention",
    body: `Workspace content is retained for as long as your account is active. Deleting a workspace removes its content from primary storage within 30 days and from backups within 90 days. Server logs are retained up to 90 days.`,
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: `Depending on your jurisdiction you may have rights to access, correct, export, or delete your personal data, and to object to or restrict certain processing. Most of these are self-serve in Settings → Account; for anything else, email privacy@planbooq.com and we will respond within 30 days.`,
  },
  {
    id: "security",
    title: "Security",
    body: `Data is encrypted in transit and at rest. Access to production systems is restricted, logged, and reviewed. No system is perfectly secure; if we ever detect a breach affecting your data we will notify you without undue delay.`,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: `If we make material changes we will notify you by email or in-app at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.`,
  },
  {
    id: "contact",
    title: "Contact",
    body: `Questions or requests: privacy@planbooq.com.`,
  },
];

export default function PrivacyV2(): React.ReactElement {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective {EFFECTIVE}</p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Table of contents" className="hidden lg:block">
          <div className="sticky top-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Contents
            </p>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <article className="max-w-2xl space-y-12">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-8">
              <h2 className="font-serif text-2xl font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-3 text-[16px] leading-7 text-foreground/90">{s.body}</p>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

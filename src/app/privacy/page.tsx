import Link from "next/link";

export default function PrivacyIndex(): React.ReactElement {
  const variants = [
    {
      slug: "v1",
      name: "Variant 1 — Minimal Legal",
      blurb: "Tight, scannable, plain-text feel. Optimized for readability.",
    },
    {
      slug: "v2",
      name: "Variant 2 — Editorial Long-form",
      blurb: "Section nav + serif body. Reads like a thoughtful policy doc.",
    },
    {
      slug: "v3",
      name: "Variant 3 — Developer TL;DR",
      blurb: "Card-based summary up top, full text below. Skim-first.",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <h1 className="font-mono text-3xl font-semibold tracking-tight">Privacy Policy — Variants</h1>
      <p className="mt-3 text-muted-foreground">Pick the variant you want to ship.</p>
      <ul className="mt-10 flex flex-col gap-3">
        {variants.map((v) => (
          <li key={v.slug}>
            <Link
              href={`/privacy/${v.slug}`}
              className="block rounded-lg border border-border/60 p-5 transition hover:border-border hover:bg-muted/40"
            >
              <div className="font-mono text-sm font-semibold">{v.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{v.blurb}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

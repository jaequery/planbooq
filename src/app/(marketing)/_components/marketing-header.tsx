"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_HREF } from "./landing-parts";

const NAV_ITEMS = [
  { id: "product", label: "Product", href: "/#product" },
  { id: "platform", label: "Platform", href: "/#platform" },
  { id: "developers", label: "Developers", href: "/#api" },
  { id: "research", label: "Research", href: "/#research" },
  { id: "pricing", label: "Pricing", href: "/pricing" },
] as const;

function Logo(): React.ReactElement {
  return (
    <Link href="/" className="flex items-center gap-2 outline-none">
      <span
        aria-hidden
        className="inline-block size-4 rounded-[3px] bg-[var(--mk-ink)] [clip-path:polygon(0_0,100%_0,100%_60%,60%_60%,60%_100%,0_100%)]"
      />
      <span className="text-[15px] font-semibold tracking-tight text-[var(--mk-ink)]">
        Planbooq
      </span>
    </Link>
  );
}

export function Header(): React.ReactElement {
  const pathname = usePathname();
  const activeId = pathname === "/pricing" ? "pricing" : pathname === "/" ? "product" : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--mk-hairline)] bg-[var(--mk-bg)]/85 backdrop-blur-md">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 lg:px-10">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center justify-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = activeId === item.id;
            return (
              <a
                key={item.id}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[13.5px] font-medium transition ${
                  isActive
                    ? "text-[var(--mk-ink)]"
                    : "text-[var(--mk-muted)] hover:text-[var(--mk-ink)]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="mailto:hello@planbooq.app"
            className="hidden h-9 items-center rounded-full px-3 text-[13.5px] font-medium text-[var(--mk-ink)] transition hover:bg-[var(--mk-surface)] sm:inline-flex"
          >
            Contact sales
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex h-9 items-center rounded-full bg-[var(--mk-ink)] px-4 text-[13.5px] font-semibold text-[var(--mk-bg)] transition hover:opacity-90"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

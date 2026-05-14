"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_HREF, serifClassName } from "./landing-parts";

const NAV_ITEMS = [
  { id: "product", label: "Product", href: "/#product" },
  { id: "learn", label: "Learn", href: "/#learn" },
  { id: "pricing", label: "Pricing", href: "/pricing" },
  { id: "help", label: "Help", href: "https://github.com/planbooq" },
] as const;

function navIdFromHash(): string {
  if (typeof window === "undefined") return "product";
  const h = window.location.hash.slice(1);
  if (h === "learn") return "learn";
  return "product";
}

function LogoMark(): React.ReactElement {
  return (
    <Link href="/" className="justify-self-start outline-none">
      <span
        className={serifClassName(
          "text-[20px] font-semibold tracking-[0.06em] text-[var(--mk-ink)] uppercase sm:text-[22px]",
        )}
      >
        Planbooq
      </span>
    </Link>
  );
}

export function Header(): React.ReactElement {
  const pathname = usePathname();
  const [hashId, setHashId] = useState<string>("product");

  useEffect(() => {
    setHashId(navIdFromHash());
    const onHash = () => setHashId(navIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const activeId = pathname === "/pricing" ? "pricing" : pathname === "/" ? hashId : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--mk-hairline)] bg-[var(--mk-bg)]/90 backdrop-blur-md">
      <div className="mx-auto grid min-h-[3.5rem] max-w-6xl grid-cols-[1fr_auto] grid-rows-[auto_auto] gap-x-4 gap-y-3 px-5 py-3 sm:px-6 md:h-[4.25rem] md:grid-cols-[1fr_auto_1fr] md:grid-rows-1 md:items-center md:gap-y-0 md:px-6 md:py-0 lg:px-8">
        <LogoMark />

        <nav
          className="col-span-2 row-start-2 flex w-full justify-center justify-self-center md:col-span-1 md:row-start-1 md:col-start-2 md:w-auto"
          aria-label="Primary"
        >
          <div className="inline-flex rounded-full border border-[var(--mk-hairline)] bg-[var(--mk-surface-2)] p-1">
            <div className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = activeId === item.id;
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition ${
                      isActive
                        ? "bg-[var(--mk-bg)] text-[var(--mk-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        : "text-[var(--mk-muted)] hover:bg-[var(--mk-bg)]/60 hover:text-[var(--mk-ink)]"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-self-end gap-5 sm:gap-6 md:col-start-3">
          <Link
            href={APP_HREF}
            className="hidden text-[14px] font-medium text-[var(--mk-ink)] opacity-80 transition hover:opacity-100 sm:inline"
          >
            Log in
          </Link>
          <Link
            href={APP_HREF}
            className="inline-flex items-center rounded-full bg-[var(--mk-surface-2)] px-5 py-2.5 text-[14px] font-semibold text-[var(--mk-ink)] transition hover:bg-[var(--mk-surface)] sm:px-6"
          >
            Start building
          </Link>
        </div>
      </div>
    </header>
  );
}

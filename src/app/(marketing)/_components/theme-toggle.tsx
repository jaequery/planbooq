"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function MarketingThemeToggle(): React.ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border p-1"
      style={{
        borderColor: "var(--mk-hairline-strong)",
        backgroundColor: "var(--mk-bg)",
      }}
    >
      <button
        type="button"
        aria-pressed={!isDark}
        aria-label="Switch to light theme"
        onClick={() => setTheme("light")}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition"
        style={{
          backgroundColor: !isDark ? "var(--mk-ink)" : "transparent",
          color: !isDark ? "var(--mk-bg)" : "var(--mk-muted)",
        }}
      >
        <SunIcon />
        Light
      </button>
      <button
        type="button"
        aria-pressed={isDark}
        aria-label="Switch to dark theme"
        onClick={() => setTheme("dark")}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition"
        style={{
          backgroundColor: isDark ? "var(--mk-ink)" : "transparent",
          color: isDark ? "var(--mk-bg)" : "var(--mk-muted)",
        }}
      >
        <MoonIcon />
        Dark
      </button>
    </div>
  );
}

function SunIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

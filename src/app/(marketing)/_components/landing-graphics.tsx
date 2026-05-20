import type { CSSProperties } from "react";

/** Abstract gradient orb used in the hero. Three pre-tuned variants. */
export function Orb({
  variant,
  size = 220,
  active = false,
  label,
  sublabel,
}: {
  variant: "plan" | "run" | "ship";
  size?: number;
  active?: boolean;
  label?: string;
  sublabel?: string;
}): React.ReactElement {
  const styles: Record<typeof variant, CSSProperties> = {
    plan: {
      ["--orb-a" as string]: "#cfd6ff",
      ["--orb-b" as string]: "#9aa6ff",
      ["--orb-c" as string]: "#5d63d8",
      ["--orb-d" as string]: "#1d1b3a",
      ["--orb-glow" as string]: "rgba(180, 140, 255, 0.55)",
    },
    run: {
      ["--orb-a" as string]: "#ffe1c2",
      ["--orb-b" as string]: "#ff9c7a",
      ["--orb-c" as string]: "#d3486d",
      ["--orb-d" as string]: "#2b0e1f",
      ["--orb-glow" as string]: "rgba(255, 180, 120, 0.65)",
    },
    ship: {
      ["--orb-a" as string]: "#d8f5c8",
      ["--orb-b" as string]: "#a8d6a1",
      ["--orb-c" as string]: "#4f8a6a",
      ["--orb-d" as string]: "#10241c",
      ["--orb-glow" as string]: "rgba(200, 230, 140, 0.55)",
    },
  };
  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="mk-orb"
        style={{
          ...styles[variant],
          width: size,
          height: size,
          opacity: active ? 1 : 0.78,
        }}
      >
        {active ? (
          <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 p-3 text-[var(--mk-ink)] shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        ) : null}
      </div>
      {label ? (
        <div className="text-center">
          <p className="text-[14px] font-semibold text-[var(--mk-ink)]">
            {label}
            {active ? (
              <span className="ml-1.5 inline-block size-1.5 translate-y-[-1px] rounded-full bg-[var(--mk-ink)]" />
            ) : null}
          </p>
          {sublabel ? (
            <p className="mt-1 max-w-[180px] text-[12.5px] leading-snug text-[var(--mk-muted)]">
              {sublabel}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Mini square gradient card used in feature blocks. */
export function GradientCard({
  variant,
  className = "",
  children,
}: {
  variant: "violet" | "amber" | "emerald" | "rose" | "sky";
  className?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const bg: Record<typeof variant, string> = {
    violet:
      "radial-gradient(120% 90% at 20% 10%, #f0e7ff 0%, #c9b8ff 35%, #6a5dc9 75%, #1a1530 100%)",
    amber:
      "radial-gradient(120% 90% at 80% 15%, #fff1d6 0%, #ffc998 30%, #d76d3a 70%, #2b0d05 100%)",
    emerald:
      "radial-gradient(120% 90% at 25% 80%, #d8f7d7 0%, #8fdcaf 30%, #2f8a64 70%, #08231e 100%)",
    rose: "radial-gradient(120% 90% at 80% 80%, #ffe1f0 0%, #f7a4c8 30%, #c14878 70%, #260815 100%)",
    sky: "radial-gradient(120% 90% at 30% 30%, #e0f0ff 0%, #98c6ff 35%, #3a6bcd 75%, #0a1a35 100%)",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ background: bg[variant] }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_120%,rgba(0,0,0,0.45),transparent_70%)]" />
      {children}
    </div>
  );
}

/** SVG mockup of the Planbooq kanban board. */
export function MockBoard({ className = "" }: { className?: string }): React.ReactElement {
  const cols = ["BACKLOG", "TODO", "BUILDING", "REVIEW", "DONE"];
  const cardsPerCol = [3, 2, 4, 2, 3];
  const colW = 110;
  const gap = 10;
  const startX = 18;
  return (
    <svg viewBox="0 0 640 360" className={className} role="img" aria-label="Planbooq board mockup">
      <rect width="640" height="360" rx="12" fill="var(--mk-bg)" />
      <rect
        x="0.5"
        y="0.5"
        width="639"
        height="359"
        rx="12"
        fill="none"
        stroke="var(--mk-hairline)"
      />
      {/* Top bar */}
      <g>
        <circle cx="16" cy="16" r="3.5" fill="#ff5f57" opacity="0.8" />
        <circle cx="28" cy="16" r="3.5" fill="#febc2e" opacity="0.8" />
        <circle cx="40" cy="16" r="3.5" fill="#28c840" opacity="0.8" />
        <text x="58" y="20" fill="var(--mk-faint)" style={{ fontSize: "10px", fontWeight: 600 }}>
          planbooq / main board
        </text>
        <rect x="540" y="8" width="88" height="18" rx="9" fill="var(--mk-surface-2)" />
        <text x="555" y="20" fill="var(--mk-muted)" style={{ fontSize: "9.5px", fontWeight: 600 }}>
          4 agents
        </text>
      </g>
      <line x1="0" y1="34" x2="640" y2="34" stroke="var(--mk-hairline)" />

      {cols.map((label, i) => {
        const x = startX + i * (colW + gap);
        const isBuild = label === "BUILDING";
        return (
          <g key={label}>
            <text
              x={x}
              y="58"
              fill="var(--mk-faint)"
              style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em" }}
            >
              {label}
            </text>
            <text
              x={x + colW - 10}
              y="58"
              textAnchor="end"
              fill="var(--mk-faint)"
              style={{ fontSize: "9px", fontWeight: 600 }}
            >
              {cardsPerCol[i]}
            </text>
            {Array.from({ length: cardsPerCol[i] ?? 0 }, (_, j) => {
              const y = 70 + j * 64;
              return (
                <g key={`${label}-${j}`}>
                  <rect
                    x={x}
                    y={y}
                    width={colW}
                    height={54}
                    rx="6"
                    fill={isBuild ? "var(--mk-surface)" : "var(--mk-bg)"}
                    stroke="var(--mk-hairline-strong)"
                    strokeWidth="0.8"
                  />
                  <rect
                    x={x + 8}
                    y={y + 8}
                    width="40"
                    height="3"
                    rx="1.5"
                    fill="var(--mk-faint)"
                    opacity="0.6"
                  />
                  <rect
                    x={x + 8}
                    y={y + 16}
                    width={60 + ((j * 7) % 22)}
                    height="4"
                    rx="1.5"
                    fill="var(--mk-ink)"
                    opacity="0.75"
                  />
                  <rect
                    x={x + 8}
                    y={y + 26}
                    width={40 + ((j * 11) % 30)}
                    height="3"
                    rx="1.5"
                    fill="var(--mk-muted)"
                    opacity="0.45"
                  />
                  {/* footer chips */}
                  {isBuild ? (
                    <>
                      <rect
                        x={x + 8}
                        y={y + 38}
                        width="22"
                        height="9"
                        rx="2"
                        fill="#fbbf24"
                        opacity="0.18"
                      />
                      <circle cx={x + 14} cy={y + 42.5} r="2" fill="#d97706" />
                      <text
                        x={x + 19}
                        y={y + 46}
                        fill="#92400e"
                        style={{ fontSize: "6px", fontWeight: 700 }}
                      >
                        RUN
                      </text>
                      <circle
                        cx={x + colW - 14}
                        cy={y + 43}
                        r="3.5"
                        fill="none"
                        stroke="var(--mk-muted)"
                        strokeWidth="0.7"
                      />
                    </>
                  ) : label === "REVIEW" ? (
                    <>
                      <rect
                        x={x + 8}
                        y={y + 38}
                        width="26"
                        height="9"
                        rx="2"
                        fill="#a7f3d0"
                        opacity="0.45"
                      />
                      <text
                        x={x + 12}
                        y={y + 45}
                        fill="#065f46"
                        style={{ fontSize: "6.5px", fontWeight: 700 }}
                      >
                        PR #{42 + j}
                      </text>
                    </>
                  ) : label === "DONE" ? (
                    <path
                      d={`M${x + colW - 18} ${y + 42}l3 3 7-8`}
                      stroke="#16a34a"
                      strokeWidth="1.4"
                      fill="none"
                      strokeLinecap="round"
                    />
                  ) : (
                    <rect
                      x={x + 8}
                      y={y + 38}
                      width="14"
                      height="9"
                      rx="2"
                      fill="var(--mk-surface-2)"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** SVG mockup of an agent panel — terminal-ish, with a progress bar. */
export function MockAgent({ className = "" }: { className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 640 360"
      className={className}
      role="img"
      aria-label="Planbooq agent panel mockup"
    >
      <rect width="640" height="360" rx="12" fill="var(--mk-bg)" />
      <rect
        x="0.5"
        y="0.5"
        width="639"
        height="359"
        rx="12"
        fill="none"
        stroke="var(--mk-hairline)"
      />
      {/* Ticket header */}
      <g>
        <rect x="16" y="14" width="44" height="16" rx="4" fill="var(--mk-surface-2)" />
        <text
          x="38"
          y="25"
          textAnchor="middle"
          fill="var(--mk-muted)"
          style={{ fontSize: "9.5px", fontWeight: 700 }}
        >
          PLAN-92F
        </text>
        <text x="68" y="25" fill="var(--mk-ink)" style={{ fontSize: "11px", fontWeight: 600 }}>
          Add quick filters to the board header
        </text>
        <g transform="translate(540 12)">
          <rect width="88" height="20" rx="10" fill="#fbbf24" fillOpacity="0.15" />
          <circle cx="14" cy="10" r="3" fill="#d97706" />
          <circle
            cx="14"
            cy="10"
            r="6"
            fill="none"
            stroke="#d97706"
            strokeOpacity="0.35"
            strokeWidth="1"
          >
            <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite" />
            <animate
              attributeName="stroke-opacity"
              values="0.4;0;0.4"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          <text x="24" y="14" fill="#92400e" style={{ fontSize: "9.5px", fontWeight: 700 }}>
            BUILDING
          </text>
        </g>
      </g>
      <line x1="0" y1="44" x2="640" y2="44" stroke="var(--mk-hairline)" />

      {/* Terminal */}
      <rect x="16" y="58" width="412" height="284" rx="8" fill="#0b0b0d" />
      <g fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        <text x="28" y="78" fill="#a3a3a3" style={{ fontSize: "9.5px" }}>
          ~/repo/planbooq
        </text>
        <text x="28" y="96" fill="#22d3ee" style={{ fontSize: "10px" }}>
          $ pnpm dev
        </text>
        <text x="28" y="112" fill="#d4d4d8" style={{ fontSize: "9.5px" }}>
          ▲ next dev — port 3636
        </text>
        <text x="28" y="128" fill="#a3a3a3" style={{ fontSize: "9.5px" }}>
          ✓ ready in 1.2s
        </text>
        <text x="28" y="152" fill="#22d3ee" style={{ fontSize: "10px" }}>
          $ claude code — work on PLAN-92F
        </text>
        <text x="28" y="170" fill="#86efac" style={{ fontSize: "9.5px" }}>
          ● applying patch · src/app/(board)/_components/header.tsx
        </text>
        <text x="28" y="186" fill="#a3a3a3" style={{ fontSize: "9.5px" }}>
          + filter chip (status, label, owner)
        </text>
        <text x="28" y="202" fill="#a3a3a3" style={{ fontSize: "9.5px" }}>
          + URL sync for active filters
        </text>
        <text x="28" y="220" fill="#86efac" style={{ fontSize: "9.5px" }}>
          ● running typecheck
        </text>
        <text x="28" y="236" fill="#a3a3a3" style={{ fontSize: "9.5px" }}>
          tsc — 0 errors
        </text>
        <text x="28" y="254" fill="#86efac" style={{ fontSize: "9.5px" }}>
          ● committing — feat(board): quick filters
        </text>
        <text x="28" y="270" fill="#fbbf24" style={{ fontSize: "9.5px" }}>
          ● opening PR…
        </text>
        <rect x="28" y="280" width="120" height="2" rx="1" fill="#22d3ee" opacity="0.8">
          <animate attributeName="width" values="40;360;40" dur="3s" repeatCount="indefinite" />
        </rect>
        <text x="28" y="304" fill="#71717a" style={{ fontSize: "9px" }}>
          worktree · feature/PLAN-92F · branch up to date
        </text>
        <text x="28" y="324" fill="#71717a" style={{ fontSize: "9px" }}>
          model · claude-sonnet-4-6 · BYOK
        </text>
      </g>
      <circle cx="416" cy="74" r="3" fill="#22d3ee">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
      </circle>

      {/* Side panel */}
      <g>
        <rect x="444" y="58" width="180" height="138" rx="8" fill="var(--mk-surface)" />
        <text x="456" y="76" fill="var(--mk-muted)" style={{ fontSize: "9px", fontWeight: 700 }}>
          DIFF
        </text>
        <text x="456" y="94" fill="var(--mk-ink)" style={{ fontSize: "10px", fontWeight: 600 }}>
          src/app/(board)/header.tsx
        </text>
        <text x="456" y="110" fill="#16a34a" style={{ fontSize: "9.5px" }}>
          + 64
        </text>
        <text x="486" y="110" fill="#dc2626" style={{ fontSize: "9.5px" }}>
          − 8
        </text>
        <rect x="456" y="120" width="160" height="6" rx="3" fill="var(--mk-surface-2)" />
        <rect x="456" y="120" width="120" height="6" rx="3" fill="#16a34a" opacity="0.6" />
        <text x="456" y="148" fill="var(--mk-muted)" style={{ fontSize: "9px", fontWeight: 700 }}>
          CI
        </text>
        <circle cx="460" cy="162" r="3" fill="#16a34a" />
        <text x="470" y="166" fill="var(--mk-ink)" style={{ fontSize: "9.5px" }}>
          typecheck
        </text>
        <circle cx="460" cy="178" r="3" fill="#16a34a" />
        <text x="470" y="182" fill="var(--mk-ink)" style={{ fontSize: "9.5px" }}>
          lint
        </text>

        <rect x="444" y="208" width="180" height="134" rx="8" fill="var(--mk-surface)" />
        <text x="456" y="226" fill="var(--mk-muted)" style={{ fontSize: "9px", fontWeight: 700 }}>
          OTHER LANES
        </text>
        {[
          { code: "PLAN-71", title: "Onboarding empty state", color: "#a78bfa" },
          { code: "PLAN-84", title: "Sidebar overflow", color: "#f59e0b" },
          { code: "PLAN-99", title: "Webhook retry", color: "#10b981" },
        ].map((row, i) => (
          <g key={row.code} transform={`translate(456 ${238 + i * 30})`}>
            <circle cx="6" cy="6" r="4" fill={row.color} />
            <text
              x="18"
              y="6"
              fill="var(--mk-muted)"
              style={{ fontSize: "8.5px", fontWeight: 700 }}
            >
              {row.code}
            </text>
            <text x="18" y="18" fill="var(--mk-ink)" style={{ fontSize: "9.5px", fontWeight: 500 }}>
              {row.title}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Simple line chart card. */
export function MockChart({ className = "" }: { className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 480 260" className={className} role="img" aria-label="throughput chart">
      <rect width="480" height="260" rx="12" fill="var(--mk-bg)" />
      <text
        x="22"
        y="34"
        fill="var(--mk-muted)"
        style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}
      >
        TICKETS SHIPPED / WEEK
      </text>
      <text x="22" y="56" fill="var(--mk-ink)" style={{ fontSize: "22px", fontWeight: 700 }}>
        38.4
      </text>
      <text x="68" y="56" fill="#16a34a" style={{ fontSize: "11px", fontWeight: 700 }}>
        ↑ 4.2x
      </text>
      <line x1="22" y1="220" x2="458" y2="220" stroke="var(--mk-hairline)" />
      {[60, 100, 140, 180, 220].map((y, i) => (
        <line
          key={`grid-${i}`}
          x1="22"
          y1={y}
          x2="458"
          y2={y}
          stroke="var(--mk-hairline)"
          strokeDasharray="2 4"
          opacity="0.6"
        />
      ))}
      {/* Solo baseline */}
      <path
        d="M22 200 Q80 195 140 192 T260 188 T380 184 T458 180"
        fill="none"
        stroke="var(--mk-faint)"
        strokeWidth="1.6"
        strokeDasharray="4 4"
      />
      {/* Planbooq curve */}
      <path
        d="M22 200 Q80 180 140 165 T260 120 T380 86 T458 60"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth="2.2"
        className="dark:[stroke:#fafafa]"
      />
      <circle cx="458" cy="60" r="4" fill="#0a0a0a" className="dark:[fill:#fafafa]" />
      {/* Legend */}
      <g transform="translate(22 240)">
        <rect width="10" height="2" y="4" fill="#0a0a0a" className="dark:[fill:#fafafa]" />
        <text x="16" y="8" fill="var(--mk-muted)" style={{ fontSize: "10px", fontWeight: 600 }}>
          With Planbooq
        </text>
        <rect width="10" height="2" y="4" x="120" fill="var(--mk-faint)" />
        <text x="136" y="8" fill="var(--mk-muted)" style={{ fontSize: "10px", fontWeight: 600 }}>
          One terminal at a time
        </text>
      </g>
    </svg>
  );
}

/** Faux brand logo for the wall — purely decorative wordmarks. */
export function LogoMark({
  label,
  shape = "circle",
}: {
  label: string;
  shape?: "circle" | "square" | "triangle" | "slash";
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-[var(--mk-faint)] transition hover:text-[var(--mk-ink)]">
      <span aria-hidden className="inline-flex size-4 items-center justify-center">
        {shape === "circle" ? <span className="size-3 rounded-full border border-current" /> : null}
        {shape === "square" ? <span className="size-3 border border-current" /> : null}
        {shape === "triangle" ? (
          <svg viewBox="0 0 12 12" className="size-3" role="presentation">
            <path d="M6 1 L11 11 L1 11 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        ) : null}
        {shape === "slash" ? (
          <svg viewBox="0 0 12 12" className="size-3" role="presentation">
            <path d="M2 10 L10 2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        ) : null}
      </span>
      <span className="text-[15px] font-semibold tracking-tight">{label}</span>
    </div>
  );
}

/** Three large monochromatic line-art icons for the safety section. */
export function SafetyIcon({
  variant,
  className = "",
}: {
  variant: "worktree" | "byok" | "branches";
  className?: string;
}): React.ReactElement {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (variant === "worktree") {
    return (
      <svg viewBox="0 0 200 140" className={className} aria-hidden="true" role="presentation">
        <rect x="80" y="20" width="40" height="24" rx="3" {...common} />
        <path d="M100 44v18" {...common} />
        <path d="M30 62h140" {...common} />
        {[30, 70, 100, 130, 170].map((x) => (
          <g key={x}>
            <path d={`M${x} 62v18`} {...common} />
            <rect x={x - 18} y="80" width="36" height="22" rx="3" {...common} />
            <path d={`M${x - 12} 88h24M${x - 12} 94h18`} {...common} opacity="0.5" />
          </g>
        ))}
      </svg>
    );
  }
  if (variant === "byok") {
    return (
      <svg viewBox="0 0 200 140" className={className} aria-hidden="true" role="presentation">
        <circle cx="62" cy="70" r="22" {...common} />
        <circle cx="62" cy="70" r="6" {...common} />
        <path d="M84 70h70" {...common} />
        <path d="M120 70v14M140 70v14M154 70v18" {...common} />
        <rect x="40" y="20" width="120" height="14" rx="4" {...common} opacity="0.5" />
        <path d="M52 27h24M84 27h12" {...common} opacity="0.5" />
        <rect x="40" y="106" width="120" height="14" rx="4" {...common} opacity="0.5" />
      </svg>
    );
  }
  // branches
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden="true" role="presentation">
      <circle cx="40" cy="30" r="5" {...common} />
      <circle cx="40" cy="70" r="5" {...common} />
      <circle cx="40" cy="110" r="5" {...common} />
      <circle cx="120" cy="50" r="5" {...common} />
      <circle cx="120" cy="90" r="5" {...common} />
      <circle cx="170" cy="70" r="5" {...common} />
      <path d="M40 35v30M40 75v30" {...common} />
      <path d="M45 30c40 0 50 20 70 20" {...common} />
      <path d="M45 110c40 0 50-20 70-20" {...common} />
      <path d="M125 50c20 0 25 20 40 20" {...common} />
      <path d="M125 90c20 0 25-20 40-20" {...common} />
    </svg>
  );
}

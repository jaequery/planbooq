"use client";

import { ChevronRight, Settings2 } from "lucide-react";
import { useState } from "react";
import { extractWorkflowStepLabel, stripWorkflowBoundary } from "@/lib/system-chat";

/**
 * Render a workflow-boundary user message as a compact collapsible pill so
 * the boilerplate ("Hard boundary rules", "Step-finish decision (REQUIRED)…",
 * etc.) doesn't drown out real conversation. Expanding reveals the original
 * step prompt; double-expanding reveals the full raw text for debugging.
 */
export function WorkflowBoundaryRow({
  body,
  align,
}: {
  body: string;
  align: "self-start" | "self-end";
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const label = extractWorkflowStepLabel(body);
  const stripped = stripWorkflowBoundary(body);
  return (
    <div className={`flex max-w-full flex-col gap-1 ${align}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        />
        <Settings2 className="size-3 opacity-70" aria-hidden />
        <span>
          Planbooq dispatched step
          {label ? <span className="ml-1 font-medium text-foreground/80">{label}</span> : null}
        </span>
      </button>
      {expanded && (
        <div className="ml-5 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-foreground/80">
          {showRaw ? body : stripped}
          {stripped !== body && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="mt-2 block text-[10px] text-muted-foreground/80 hover:text-foreground"
            >
              {showRaw ? "Hide boundary boilerplate" : "Show boundary boilerplate"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

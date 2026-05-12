"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetShortcuts, updateShortcuts } from "@/actions/user-preferences";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_SHORTCUTS,
  formatChord,
  JUMP_SLOT_COUNT,
  type ProjectShortcuts,
} from "@/lib/shortcuts/defaults";
import { cn } from "@/lib/utils";

type Props = {
  initialShortcuts: ProjectShortcuts;
};

type CaptureTarget = { kind: "jump"; index: number } | { kind: "prev" } | { kind: "next" } | null;

function captureKeyFromEvent(event: KeyboardEvent | React.KeyboardEvent): string | null {
  if (
    event.key === "Meta" ||
    event.key === "Control" ||
    event.key === "Shift" ||
    event.key === "Alt"
  ) {
    return null;
  }
  if (event.key === "Escape") return null;
  return event.key;
}

export function ShortcutsClient({ initialShortcuts }: Props): React.ReactElement {
  const [shortcuts, setShortcuts] = useState<ProjectShortcuts>(initialShortcuts);
  const [capturing, setCapturing] = useState<CaptureTarget>(null);
  const [pending, startTransition] = useTransition();

  function applyCapture(next: ProjectShortcuts): void {
    setShortcuts(next);
    setCapturing(null);
    startTransition(async () => {
      const res = await updateShortcuts(next);
      if (!res.ok) {
        toast.error(res.error);
        setShortcuts(initialShortcuts);
      } else {
        toast.success("Shortcut updated");
      }
    });
  }

  function handleCaptureKeyDown(
    target: NonNullable<CaptureTarget>,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      setCapturing(null);
      return;
    }
    const key = captureKeyFromEvent(event);
    if (!key) return;
    event.preventDefault();

    const next: ProjectShortcuts = {
      jumpToProject: [...shortcuts.jumpToProject],
      prevProject: shortcuts.prevProject,
      nextProject: shortcuts.nextProject,
    };
    if (target.kind === "jump") next.jumpToProject[target.index] = key;
    if (target.kind === "prev") next.prevProject = key;
    if (target.kind === "next") next.nextProject = key;
    applyCapture(next);
  }

  function onReset(): void {
    setShortcuts(DEFAULT_SHORTCUTS);
    startTransition(async () => {
      const res = await resetShortcuts();
      if (!res.ok) toast.error(res.error);
      else toast.success("Shortcuts reset to defaults");
    });
  }

  const rows: Array<{ label: string; target: NonNullable<CaptureTarget>; chord: string }> = [
    ...Array.from({ length: JUMP_SLOT_COUNT }, (_, i) => ({
      label: `Jump to project ${i + 1}`,
      target: { kind: "jump" as const, index: i },
      chord: shortcuts.jumpToProject[i] ?? DEFAULT_SHORTCUTS.jumpToProject[i] ?? String(i + 1),
    })),
    { label: "Previous project", target: { kind: "prev" as const }, chord: shortcuts.prevProject },
    { label: "Next project", target: { kind: "next" as const }, chord: shortcuts.nextProject },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Shortcuts</h2>
        <p className="text-xs text-muted-foreground">
          Keyboard shortcuts for jumping between projects. All chords use{" "}
          <kbd className="rounded border px-1 text-[11px]">⌘</kbd> (or{" "}
          <kbd className="rounded border px-1 text-[11px]">Ctrl</kbd> on Windows/Linux). Some
          defaults override browser shortcuts (e.g. tab switching, history nav) while focused inside
          Planbooq.
        </p>
      </div>

      <div className="flex flex-col divide-y rounded-md border">
        {rows.map((row) => {
          const isCapturing =
            capturing &&
            ((capturing.kind === "jump" &&
              row.target.kind === "jump" &&
              capturing.index === row.target.index) ||
              (capturing.kind !== "jump" && capturing.kind === row.target.kind));
          return (
            <div
              key={`${row.target.kind}-${row.target.kind === "jump" ? row.target.index : ""}`}
              className="flex h-9 items-center justify-between px-3"
            >
              <span className="text-[13px]">{row.label}</span>
              <button
                type="button"
                onClick={() => setCapturing(row.target)}
                onBlur={() => setCapturing(null)}
                onKeyDown={(e) => {
                  if (isCapturing) handleCaptureKeyDown(row.target, e);
                }}
                disabled={pending}
                className={cn(
                  "inline-flex h-6 min-w-[60px] items-center justify-center rounded border px-2 text-[11px]",
                  "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCapturing && "bg-muted text-muted-foreground",
                )}
                aria-label={`Edit shortcut: ${row.label}`}
              >
                {isCapturing ? "Press a key…" : formatChord(row.chord)}
              </button>
            </div>
          );
        })}
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>
          Reset to defaults
        </Button>
      </div>
    </section>
  );
}

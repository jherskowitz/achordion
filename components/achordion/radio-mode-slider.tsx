"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mode picker for the radio Station Builder. Replaces the three
 * radio-card buttons (Easy / Medium / Hard) with a 3-step slider
 * tucked behind a "Filters" accordion, mirroring the
 * `FamiliaritySlider` pattern from the explore overview.
 *
 * Three positions, mapped to the LB Radio API's underlying modes:
 *
 *   0  → "easy"   → "Narrow"   — stay close, tracks similar to seed
 *   50 → "medium" → "Standard" — adjacent artists / styles
 *   100 → "hard"  → "Tight"    — bigger jumps from the seed
 *
 * The user-facing labels are deliberately re-named — "Easy / Hard"
 * read as a difficulty axis, but the underlying choice is really how
 * tightly the algorithm hugs the seed. "Narrow / Tight" reads more
 * like a radius dial.
 *
 * The component is client-side only because the form needs the
 * picked value as a hidden input by the time the user clicks Submit.
 * We keep the component self-contained — no URL routing here, the
 * outer form drives navigation.
 */

const STEPS = [
  {
    value: 0,
    mode: "easy" as const,
    label: "Narrow",
    blurb: "Stay close — tracks similar to the seed.",
  },
  {
    value: 50,
    mode: "medium" as const,
    label: "Standard",
    blurb: "Mix it up — adjacent artists and styles.",
  },
  {
    value: 100,
    mode: "hard" as const,
    label: "Tight",
    blurb: "Wide net — bigger jumps from the seed.",
  },
] as const;

export type RadioMode = (typeof STEPS)[number]["mode"];

function valueFromMode(m: RadioMode): number {
  return STEPS.find((s) => s.mode === m)?.value ?? 0;
}

function stepFromValue(v: number) {
  // Snap to the closest of 0/50/100. The slider's `step={50}` already
  // does this on the input side; the lookup is just to map the
  // resulting value back onto a step record.
  const closest = STEPS.reduce((best, s) =>
    Math.abs(s.value - v) < Math.abs(best.value - v) ? s : best,
  );
  return closest;
}

export function RadioModeSlider({
  initialMode = "easy",
  /** Form-input name. The parent <form> reads this on submit so the
   *  builder page receives ?mode=easy|medium|hard. */
  name = "mode",
}: {
  initialMode?: RadioMode;
  name?: string;
}) {
  const [v, setV] = useState(valueFromMode(initialMode));
  // Auto-open when the user is landing on a non-default mode — same
  // posture as the FamiliaritySlider, so a non-default override is
  // visible without having to click into the disclosure.
  const [open, setOpen] = useState(initialMode !== "easy");

  const current = stepFromValue(v);
  const overridden = current.mode !== "easy";

  return (
    <div className="min-w-0">
      {/* Hidden form input — what actually gets submitted. The visible
          slider drives this via state. */}
      <input type="hidden" name={name} value={current.mode} />

      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <SlidersHorizontal className="size-3" />
        <span>Mode</span>
        <span
          className={cn(
            "text-muted-foreground/70 hidden sm:inline",
            !overridden && "text-muted-foreground/50",
          )}
        >
          · {current.label}
        </span>
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-border/60 bg-muted/30 mt-2 rounded-lg border px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground/70 shrink-0 text-[10px] tracking-wide uppercase">
              {STEPS[0].label}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={50}
              value={v}
              onChange={(e) => setV(Number(e.target.value))}
              aria-label="Mode"
              className="accent-foreground h-1 w-full cursor-pointer"
            />
            <span className="text-muted-foreground/70 shrink-0 text-[10px] tracking-wide uppercase">
              {STEPS[STEPS.length - 1].label}
            </span>
          </div>
          <p className="text-muted-foreground/80 mt-1 text-[11px]">
            <span className="text-foreground font-medium">{current.label}</span>
            {" — "}
            {current.blurb}
          </p>
        </div>
      )}
    </div>
  );
}

/** Display label for a given mode, used by preset chips so they show
 *  the new vocabulary instead of the underlying mode token. */
export function modeLabel(mode: RadioMode): string {
  return STEPS.find((s) => s.mode === mode)?.label ?? mode;
}

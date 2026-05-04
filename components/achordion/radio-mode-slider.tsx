"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RADIO_MODE_STEPS,
  stepFromValue,
  valueFromMode,
  type RadioMode,
} from "@/lib/radio-modes";

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
 * Step data + helpers (mode→value, value→step, label lookup) live in
 * `lib/radio-modes.ts` so server components can read the labels too
 * (RSC tags every export of a `"use client"` module as client-only).
 *
 * The component is client-side only because the form needs the
 * picked value as a hidden input by the time the user clicks Submit.
 * We keep the component self-contained — no URL routing here, the
 * outer form drives navigation.
 */
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
              {RADIO_MODE_STEPS[0].label}
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
              {RADIO_MODE_STEPS[RADIO_MODE_STEPS.length - 1].label}
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

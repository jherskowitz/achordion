"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { ParachordCtaButton } from "./parachord-button";
import { parachordPlayRadio } from "@/lib/parachord";
import {
  STAT_RANGES,
  STAT_RANGE_LABELS,
  type StatRange,
} from "@/lib/types/stat-range";
import { cn } from "@/lib/utils";

const DEFAULT_RANGE: StatRange = "week";

/**
 * Per-profile LB-Radio widget. Fires a `parachord://play/radio?prompt=
 * stats:(<user>:<range>)` URL — Parachord calls the LB Radio API
 * client-side using the listener's own token, so we never have to
 * proxy the request server-side.
 *
 * Range picker is a 7-step slider tucked behind a small disclosure
 * (matching the `RadioModeSlider` accordion pattern). Default range
 * is "week" — same default LB itself uses for stats endpoints.
 */
export function UserStatsRadioWidget({ username }: { username: string }) {
  const [range, setRange] = useState<StatRange>(DEFAULT_RANGE);
  const [open, setOpen] = useState(false);

  const idx = STAT_RANGES.indexOf(range);
  const max = STAT_RANGES.length - 1;
  const overridden = range !== DEFAULT_RANGE;

  const playHref = parachordPlayRadio({
    prompt: `stats:(${username}:${range})`,
    displayName: `${username} — Stats Radio (${STAT_RANGE_LABELS[range]})`,
  });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <ParachordCtaButton
        href={playHref}
        label="Stats Radio"
        size="sm"
      />
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        aria-controls={`stats-radio-range-${username}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[11px]"
      >
        <SlidersHorizontal className="size-3" />
        <span>Range</span>
        <span
          className={cn(
            "text-muted-foreground/70",
            !overridden && "text-muted-foreground/50",
          )}
        >
          · {STAT_RANGE_LABELS[range]}
        </span>
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          id={`stats-radio-range-${username}`}
          className="border-border/60 bg-muted/30 w-64 max-w-[80vw] rounded-lg border px-3 py-3"
        >
          {/* Native range input — keyboard support comes free; click on
              the track auto-snaps to the nearest step thanks to step=1. */}
          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={idx}
            onChange={(e) => setRange(STAT_RANGES[Number(e.target.value)])}
            aria-label="Stats time range"
            className="accent-foreground h-1 w-full cursor-pointer"
          />
          <div className="mt-2 flex items-center justify-between gap-1">
            {STAT_RANGES.map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={active}
                  title={STAT_RANGE_LABELS[r]}
                  className={cn(
                    "text-[9px] tracking-wide uppercase transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground/60 hover:text-foreground",
                  )}
                >
                  {/* Single-letter step labels keep the slider tight;
                      the full label sits above on the trigger button
                      and as the title attribute for hover. */}
                  {shortLabel(r)}
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground/80 mt-2 text-[10px]">
            Seeds Parachord with{" "}
            <span className="text-foreground">{username}</span>&rsquo;s top
            tracks from{" "}
            <span className="text-foreground">
              {STAT_RANGE_LABELS[range].toLowerCase()}
            </span>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function shortLabel(r: StatRange): string {
  switch (r) {
    case "this_week":
      return "TW";
    case "week":
      return "W";
    case "this_month":
      return "TM";
    case "month":
      return "M";
    case "this_year":
      return "TY";
    case "year":
      return "Y";
    case "all_time":
      return "All";
  }
}

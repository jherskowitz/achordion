"use client";

import { useState } from "react";
import { ChevronDown, Play, Radio } from "lucide-react";
import { parachordPlayRadio } from "@/lib/parachord";
import { useParachordPresence } from "@/lib/use-parachord-presence";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  STAT_RANGES,
  STAT_RANGE_LABELS,
  type StatRange,
} from "@/lib/types/stat-range";
import { cn } from "@/lib/utils";

const DEFAULT_RANGE: StatRange = "week";

/**
 * Per-profile LB-Radio card. Same visual shape as <LbRadioSection>
 * (rounded card, circular Radio icon, uppercase name + subtitle,
 * chevron expand) so the right edge of the user header reads as a
 * sibling of the LB Radio cards on /radio.
 *
 * Click the icon → fires `parachord://play/radio?prompt=stats:(<user>:
 * <range>)`. Parachord calls the LB Radio API client-side using the
 * listener's own token, so we never have to proxy the request.
 *
 * Range picker is a 7-step native slider (no step labels — the helper
 * text below updates live as the slider moves) tucked inside the
 * chevron accordion.
 */
export function UserStatsRadioWidget({ username }: { username: string }) {
  const [range, setRange] = useState<StatRange>(DEFAULT_RANGE);
  const [open, setOpen] = useState(false);
  const parachordRunning = useParachordPresence();

  const idx = STAT_RANGES.indexOf(range);
  const max = STAT_RANGES.length - 1;
  const rangeLabel = STAT_RANGE_LABELS[range];

  const radioName = `${username} Radio`;
  const playHref = parachordPlayRadio({
    prompt: `stats:(${username}:${range})`,
    displayName: `${radioName} (${rangeLabel})`,
  });

  const iconButtonBase =
    "group/playbtn flex size-9 shrink-0 items-center justify-center rounded-full transition-colors";
  const icon = parachordRunning ? (
    <a
      href={playHref}
      aria-label={`Play ${radioName} in Parachord`}
      className={cn(iconButtonBase, "bg-foreground/10 hover:text-white")}
      style={{
        ["--play-bg" as string]: "var(--parachord-accent)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--play-bg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "";
      }}
    >
      <Radio className="size-4 group-hover/playbtn:hidden" />
      <Play className="size-4 hidden fill-current group-hover/playbtn:block" />
    </a>
  ) : (
    <span
      aria-disabled
      className={cn(
        iconButtonBase,
        "bg-muted text-muted-foreground cursor-not-allowed",
      )}
    >
      <Radio className="size-4" />
    </span>
  );

  return (
    <div className="border-border/60 bg-background relative w-72 max-w-[80vw] rounded-2xl border">
      <div className="flex items-center gap-3 p-3">
        <IconTooltip
          side="top"
          align="start"
          label={
            parachordRunning
              ? `Play ${radioName} in Parachord`
              : "Parachord isn't running"
          }
        >
          {icon}
        </IconTooltip>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-wide uppercase">
            {radioName}
          </h2>
          <p className="text-muted-foreground/80 truncate text-xs">
            {rangeLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          aria-expanded={open}
          aria-label={open ? "Hide range picker" : "Show range picker"}
          aria-controls={`stats-radio-range-${username}`}
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {open && (
        <div
          id={`stats-radio-range-${username}`}
          className="border-border/60 bg-background absolute left-0 right-0 top-full z-30 mt-1 rounded-2xl border px-3 pb-3 pt-3 shadow-lg"
        >
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
          <p className="text-muted-foreground/80 mt-2 text-[11px] leading-5">
            <span className="text-foreground font-medium">{rangeLabel}</span> —
            seeds Parachord with{" "}
            <span className="text-foreground">{username}</span>&rsquo;s top
            tracks from{" "}
            <span className="text-foreground">{rangeLabel.toLowerCase()}</span>
            .
          </p>
        </div>
      )}
    </div>
  );
}

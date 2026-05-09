"use client";

/**
 * Two-set compatibility visualization — viewer vs profile-owner —
 * for the followers / following pages. Shows a Jaccard-index
 * percentage ("47% mutual") plus an SVG Venn that proportionally
 * sizes the overlap region against the union, so the visual area
 * tracks the number.
 *
 * Caller (the page) computes the three counts (viewer-only, both,
 * owner-only) and passes them in.
 *
 * Accessibility: the SVG is `aria-hidden`; an inline summary
 * sentence below the chart is the screen-reader source of truth.
 * Hover-tooltips (Radix-driven) on each region give the exact
 * count in styled context, replacing the native browser-yellow
 * `<title>` we used to ship.
 *
 * Why a client component: Radix Tooltip needs a client boundary,
 * and the SVG triggers benefit from the same hover delay /
 * positioning logic the rest of the app uses. The component does
 * no async work itself — it's just rendering arithmetic.
 */

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CompatibilityVennProps {
  /** Display name for the viewer ("You" almost always — pass the
   *  literal string). */
  viewerLabel: string;
  /** Display name for the profile owner. */
  ownerLabel: string;
  /** Count of names ONLY in the viewer's set. */
  viewerOnly: number;
  /** Count of names in BOTH sets — the overlap. */
  both: number;
  /** Count of names ONLY in the profile-owner's set. */
  ownerOnly: number;
  /** "Followers" or "Following" — used in the summary copy. */
  metricLabel: string;
  className?: string;
}

export function CompatibilityVenn({
  viewerLabel,
  ownerLabel,
  viewerOnly,
  both,
  ownerOnly,
  metricLabel,
  className,
}: CompatibilityVennProps) {
  const union = viewerOnly + both + ownerOnly;
  // Jaccard index — |A ∩ B| / |A ∪ B|. Clean single-number compat
  // score that's bounded 0-100 and intuitive: identical sets → 100,
  // disjoint sets → 0, halfway-overlapping → 33ish.
  const pct = union === 0 ? 0 : Math.round((both / union) * 100);

  // Drive the visual overlap area off the actual proportion, not a
  // fixed offset. Each circle's radius scales with sqrt(setSize) so
  // the visible AREA tracks the count (not the diameter, which
  // would over-emphasize big sets). The horizontal gap between the
  // two centres scales inversely with the overlap fraction so a
  // high-compat pair shows mostly-merged circles, a low-compat
  // pair shows barely-touching ones.
  const viewerSize = viewerOnly + both;
  const ownerSize = ownerOnly + both;

  const SVG_W = 280;
  const SVG_H = 140;
  const MAX_R = 60;
  const MIN_R = 30;
  const maxSet = Math.max(viewerSize, ownerSize, 1);
  const scaleR = (n: number) => {
    if (n === 0) return MIN_R;
    const ratio = Math.sqrt(n / maxSet);
    return MIN_R + (MAX_R - MIN_R) * ratio;
  };
  const rViewer = scaleR(viewerSize);
  const rOwner = scaleR(ownerSize);
  // Overlap fraction drives centre separation. 0 overlap → circles
  // tangent (just touching). 100% overlap → centres coincide.
  const overlapFraction = union === 0 ? 0 : both / union;
  const sumR = rViewer + rOwner;
  const separation = sumR * (1 - overlapFraction);
  const cx = SVG_W / 2;
  const cy = SVG_H / 2;
  const cxViewer = cx - separation / 2;
  const cxOwner = cx + separation / 2;

  return (
    <div
      className={cn(
        "border-border/60 rounded-xl border p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="h-32 w-full max-w-[280px] shrink-0 sm:w-[280px]"
          aria-hidden
        >
          {/* Each circle is a Radix Tooltip trigger so hover gives
              the styled popover we use elsewhere on the site,
              instead of the native yellow <title> tooltip. asChild
              clones the SVG element rather than wrapping it in a
              span — preserves the SVG hierarchy. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <circle
                cx={cxViewer}
                cy={cy}
                r={rViewer}
                className="fill-foreground/15 stroke-foreground/40 cursor-help"
                strokeWidth={1}
              />
            </TooltipTrigger>
            <TooltipContent>
              {viewerLabel}: {(viewerOnly + both).toLocaleString()}{" "}
              {metricLabel.toLowerCase()}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <circle
                cx={cxOwner}
                cy={cy}
                r={rOwner}
                className="fill-primary/30 stroke-primary/60 cursor-help"
                strokeWidth={1}
              />
            </TooltipTrigger>
            <TooltipContent>
              {ownerLabel}: {(ownerOnly + both).toLocaleString()}{" "}
              {metricLabel.toLowerCase()}
            </TooltipContent>
          </Tooltip>
          {/* Labels positioned at each circle's "exclusive" side so
              they don't overlap the intersection region. */}
          <text
            x={cxViewer - rViewer * 0.55}
            y={cy + 4}
            textAnchor="middle"
            className="fill-foreground text-[11px] font-medium tabular-nums"
          >
            {viewerOnly}
          </text>
          <text
            x={cxOwner + rOwner * 0.55}
            y={cy + 4}
            textAnchor="middle"
            className="fill-foreground text-[11px] font-medium tabular-nums"
          >
            {ownerOnly}
          </text>
          {/* Intersection count — only render when there's enough
              overlap to host a label without colliding with the
              two side labels. */}
          {both > 0 && separation < sumR * 0.85 && (
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-bold tabular-nums"
            >
              {both}
            </text>
          )}
        </svg>

        <div className="flex-1 text-center sm:text-left">
          <p className="text-foreground text-3xl font-semibold tabular-nums">
            {pct}%
          </p>
          <p className="text-muted-foreground mt-0.5 inline-flex items-center gap-1 text-xs tracking-wide uppercase">
            {metricLabel} compatibility
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How is compatibility calculated?"
                  className="text-muted-foreground/70 hover:text-foreground inline-flex cursor-help items-center"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-center">
                Share of the combined unique{" "}
                {metricLabel.toLowerCase()} across both of you that
                you have in common — {both.toLocaleString()} mutual
                ÷ {union.toLocaleString()} total unique = {pct}%.
              </TooltipContent>
            </Tooltip>
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            <span className="text-foreground font-medium tabular-nums">
              {both.toLocaleString()}
            </span>{" "}
            {metricLabel.toLowerCase()} in common ·{" "}
            <span className="text-foreground tabular-nums">
              {viewerOnly.toLocaleString()}
            </span>{" "}
            only {viewerLabel.toLowerCase()} ·{" "}
            <span className="text-foreground tabular-nums">
              {ownerOnly.toLocaleString()}
            </span>{" "}
            only {ownerLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

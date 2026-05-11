"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import type { ListenerFingerprint as FingerprintData } from "@/lib/listener-fingerprint";
import { artistHref } from "@/lib/entity-links";
import { IconTooltip } from "@/components/ui/icon-tooltip";

/**
 * Interactive listener-fingerprint renderer.
 *
 * Each wedge becomes a hover/focus/click target:
 *   - Hovering a wedge bumps its outer radius outward, brightens
 *     it, and dims the rest of the glyph to make the focused
 *     artist read sharply.
 *   - The inner-hole label shows the hovered artist's name +
 *     play count (or a hint when nothing's hovered).
 *   - Clicking a wedge deep-links to that artist's
 *     `/artist/<mbid>` page (or `/artist/lookup?name=…` fallback).
 *
 * Animation: re-rendering paths with a different outer radius is
 * not CSS-transitionable (the SVG `d` attribute doesn't animate
 * smoothly in most browsers). We compensate with a fast
 * `transition: opacity` on the dim effect + a brand-tinted halo
 * filter on the hovered wedge so the focus moment reads as
 * deliberate rather than abrupt.
 *
 * Renders empty wedges (the padding zeroes when a user has <24 top
 * artists) as non-interactive — no hover state, no click target.
 */
export function ListenerFingerprintInteractive({
  data,
  dim,
}: {
  data: FingerprintData;
  dim: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // SVG coordinate system: 100×100. Same constants as the static
  // server-rendered version so the visual sizing matches across
  // both code paths.
  const SIZE = 100;
  const CENTER = SIZE / 2;
  const INNER_RADIUS = 16;
  const OUTER_RADIUS_MAX = 46;
  // Hover extension: how far past OUTER_RADIUS_MAX a focused wedge
  // grows. 4 SVG units ≈ ~5% of the SIZE — enough to read as a
  // visible "lift" without crossing the SVG bounds.
  const HOVER_EXTENSION = 4;
  const SEGMENTS = data.segments.length;
  const ANGLE_PER_SEGMENT = 360 / SEGMENTS;
  const GAP_DEG = 1;

  const hovered =
    hoveredIndex !== null ? data.segments[hoveredIndex] : null;
  const hoveredIsInteractive =
    hovered !== null && hovered.height > 0 && hovered.artistName !== "";

  // Show the contextual label only at lg — the sm variant is meant
  // for inline use on user cards / list rows where there's no room
  // for a 2-line label below the chart.
  const showLabel = dim >= 96;

  return (
    // Width pinned to the chart's dimension so the wrapper doesn't
    // expand or contract as the label below swaps between artist
    // names of different widths — that's what was making the whole
    // header jiggle on hover. The chart's own `overflow-visible`
    // lets the hover-extended wedge paint past these bounds without
    // affecting layout.
    <div
      className="inline-flex flex-col items-center gap-1.5"
      style={{ width: dim }}
    >
      {/* Eyebrow + "?" — names the chart for passive viewers and
          gives curious ones an on-demand explanation via the
          IconTooltip. Same eyebrow typography as the LISTENBRAINZ
          USER caption on the profile header so the visual register
          is consistent. Only renders at lg (sm thumbnails skip the
          chrome — the chart itself is the affordance). */}
      {showLabel && (
        <div className="text-muted-foreground inline-flex items-center gap-1 text-[10px] tracking-wide uppercase">
          <span>Listener fingerprint</span>
          <IconTooltip
            label={
              // `normal-case tracking-normal text-xs` resets the
              // `uppercase` / `tracking-wide` / `text-[10px]` the
              // tooltip would otherwise inherit from the eyebrow
              // parent. Without these resets the bubble renders as
              // a wall of squished all-caps text.
              <span className="block max-w-[240px] whitespace-normal text-left text-xs leading-snug normal-case tracking-normal">
                <span className="block font-semibold">
                  Listener fingerprint
                </span>
                <span className="text-background/70 mt-0.5 block text-[11px] leading-4">
                  Each wedge is one of this user&apos;s top 24
                  artists. Taller wedge = more plays. Hover for
                  the artist; click to open their page.
                </span>
              </span>
            }
            side="bottom"
            // `align="end"` — the chart sits at the right edge of
            // the profile header, so a centred bubble extends past
            // the viewport on narrow widths. End-aligning anchors
            // the bubble's right edge to the trigger and lets it
            // grow leftward, staying inside the page.
            align="end"
          >
            <button
              type="button"
              aria-label="What is the listener fingerprint?"
              className="hover:text-foreground inline-flex size-4 items-center justify-center rounded-full transition-colors"
            >
              <HelpCircle className="size-3" />
            </button>
          </IconTooltip>
        </div>
      )}
      <svg
        role="img"
        aria-label={`Listener fingerprint with ${data.topArtists.length} top artists`}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={dim}
        height={dim}
        className="shrink-0 overflow-visible"
      >
        {data.segments.map((seg, i) => {
          const startAngle = i * ANGLE_PER_SEGMENT - 90 + GAP_DEG / 2;
          const endAngle = (i + 1) * ANGLE_PER_SEGMENT - 90 - GAP_DEG / 2;
          const isHovered = hoveredIndex === i;
          const baseOuter =
            INNER_RADIUS + seg.height * (OUTER_RADIUS_MAX - INNER_RADIUS);
          const outerRadius = isHovered
            ? baseOuter + HOVER_EXTENSION
            : baseOuter;
          const d = arcPath(
            CENTER,
            CENTER,
            INNER_RADIUS,
            outerRadius,
            startAngle,
            endAngle,
          );
          const isPad = seg.height === 0;
          // Dim non-hovered wedges (but only when SOMETHING is
          // hovered — otherwise the glyph reads at full opacity in
          // its idle state). Padding wedges stay at their muted
          // baseline regardless.
          const opacity =
            isPad || hoveredIndex === null || isHovered ? 1 : 0.35;
          const fill = isPad ? "var(--muted)" : seg.color || "var(--primary)";

          // Padding wedges aren't clickable / hoverable — they don't
          // represent an artist. Render as a plain <path>.
          if (isPad) {
            return (
              <path
                key={i}
                d={d}
                fill={fill}
                opacity={opacity}
                style={{ transition: "opacity 150ms ease-out" }}
              />
            );
          }

          // Interactive wedges: <a> wrapper deep-links to the
          // artist page on click; `pointer-events` only on the
          // path itself so the SVG's own bounds don't intercept
          // hover when the cursor's between wedges.
          return (
            <Link
              key={i}
              href={artistHref({ mbid: seg.artistMbid, name: seg.artistName })}
              aria-label={`${seg.artistName} · ${seg.listenCount.toLocaleString()} plays`}
            >
              <path
                d={d}
                fill={fill}
                opacity={opacity}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex(null)}
                tabIndex={0}
                style={{
                  cursor: "pointer",
                  transition: "opacity 150ms ease-out",
                  outline: "none",
                }}
              />
              {/* No SVG `<title>` per wedge — the inner-hole label
                  below already shows the hovered artist + plays
                  cleanly, and the native browser tooltip rendered
                  by `<title>` extends off-screen on long artist
                  names ("Nathaniel Rateliff & The Night Sweats…")
                  with no way to control its truncation. */}
            </Link>
          );
        })}
      </svg>
      {/* Contextual label, rendered as real HTML so we get proper
          font sizing + truncation + accessibility, instead of SVG
          `<text>` elements that are illegibly small inside a 100-
          unit viewBox. Reserved min-height (matches a two-line
          stack) keeps the surrounding layout from jittering as the
          label swaps between the idle hint and a hovered artist. */}
      {showLabel && (
        // Reserved height = 2 × text-xs (12px) line-box at leading-
        // tight (1.25) + the mt-0.5 gap (2px) between the two lines.
        // 2 × 15 + 2 = 32px. Reserving exactly that keeps the chart
        // anchored when the label swaps between the 1-line idle
        // hint and the 2-line hovered artist state — without the
        // pin, the donut shifts ~3px on hover-in / hover-out.
        <div className="min-h-[32px] text-center text-xs leading-tight">
          {hoveredIsInteractive && (
            <>
              {/* `w-full truncate` (no max-w) so the artist name
                  fills the chart-width container exactly — names
                  longer than the chart get ellipsised in place
                  without nudging the wrapper wider. */}
              <p className="text-foreground w-full truncate font-medium">
                {hovered!.artistName}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {hovered!.listenCount.toLocaleString()} plays
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Build a filled arc path between two angles (degrees) on two
 *  concentric radii. SVG `d` attribute string. Same shape as the
 *  static renderer in `<ListenerFingerprint>`. */
function arcPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(startRad);
  const y1 = cy + rOuter * Math.sin(startRad);
  const x2 = cx + rOuter * Math.cos(endRad);
  const y2 = cy + rOuter * Math.sin(endRad);
  const x3 = cx + rInner * Math.cos(endRad);
  const y3 = cy + rInner * Math.sin(endRad);
  const x4 = cx + rInner * Math.cos(startRad);
  const y4 = cy + rInner * Math.sin(startRad);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 0 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

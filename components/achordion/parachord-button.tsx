"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useParachordPresence } from "@/lib/use-parachord-presence";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Where to direct users who don't have Parachord installed yet. */
const PARACHORD_HOMEPAGE = "https://parachord.com";

/**
 * The "Get Parachord" tooltip body shared by every disabled-state
 * play affordance. Centralised so the messaging stays consistent
 * across CTA, hover-fab, inline icon, and number-swap surfaces.
 */
function GetParachordTooltipContent() {
  return (
    <TooltipContent side="top" className="max-w-[220px] text-center">
      <p>Parachord isn&apos;t running.</p>
      <a
        href={PARACHORD_HOMEPAGE}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        Get Parachord →
      </a>
    </TooltipContent>
  );
}

/**
 * Inline icon button rendered alongside track rows. Hidden by default,
 * fades in when its parent `<li className="group">` is hovered/focused.
 *
 * Two states (mirrors `ParachordCtaButton` / `PlayOnHoverFab`):
 *
 *   • CONNECTED — anchor with the play icon; tooltip shows the label.
 *
 *   • NOT CONNECTED — `aria-disabled` span styled muted; tooltip
 *     points to parachord.com.
 *
 * Tooltip content is rendered through a portal so it escapes the
 * row's `overflow:hidden` ancestors.
 */
export function ParachordPlayButton({
  href,
  label = "Play in Parachord",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  const running = useParachordPresence();

  const baseClasses =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100";

  if (running) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            aria-label={label}
            className={cn(
              "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
              baseClasses,
              className,
            )}
          >
            <Play className="size-3.5 fill-current" />
          </a>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          aria-disabled="true"
          aria-label={label}
          tabIndex={0}
          className={cn(
            "text-muted-foreground/60 cursor-not-allowed",
            baseClasses,
            className,
          )}
        >
          <Play className="size-3.5 fill-current" />
        </span>
      </TooltipTrigger>
      <GetParachordTooltipContent />
    </Tooltip>
  );
}

/**
 * Track-row cell that swaps a track number for a play button on
 * `group-hover`. Width and alignment are controlled by className so the
 * cell can adapt to the row's existing rhythm (e.g. `w-8 text-right` for
 * album tracklists, `w-5 text-center` for popular-tracks lists).
 *
 * Same two-state contract as `ParachordPlayButton`: connected → live
 * play anchor; disconnected → muted disabled icon with the
 * "Get Parachord" tooltip on hover/focus.
 */
export function PlayOverNumberCell({
  number,
  href,
  label = "Play in Parachord",
  className,
  align = "center",
}: {
  number: React.ReactNode;
  href: string;
  label?: string;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const running = useParachordPresence();
  const numberAlign =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";

  // Visible play indicator — anchor when connected, span when not.
  // Both are absolutely positioned over the number cell, fade in on
  // group-hover. Wrapped in a Tooltip so the label / install pitch
  // shows up on hover or keyboard focus.
  const playOverlay = running ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          aria-label={label}
          className="text-foreground absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Play className="size-3 fill-current" />
        </a>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          aria-disabled="true"
          aria-label={label}
          tabIndex={0}
          className="text-muted-foreground/60 absolute inset-0 flex cursor-not-allowed items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Play className="size-3 fill-current" />
        </span>
      </TooltipTrigger>
      <GetParachordTooltipContent />
    </Tooltip>
  );

  return (
    <span
      className={cn(
        "text-muted-foreground relative inline-block shrink-0 text-xs tabular-nums",
        className,
      )}
    >
      <span
        className={cn(
          "block transition-opacity group-hover:opacity-0",
          numberAlign,
        )}
        aria-hidden
      >
        {number}
      </span>
      {playOverlay}
    </span>
  );
}

/**
 * Filled CTA button used on album / playlist / station cards
 * — "Play in Parachord", "Open this radio in Parachord", etc.
 *
 * Two visual states, swapped by `useParachordPresence` (which probes
 * the desktop app's `ws://127.0.0.1:9876` listener):
 *
 *   • CONNECTED — Parachord brand purple `#8b5cf6`, pulsing green
 *     status dot, anchor that opens the parachord:// URL. Matches the
 *     button style on go.parachord.com smart-link pages.
 *
 *   • NOT CONNECTED — same shape and label, neutral muted styling,
 *     `aria-disabled`, no navigation. Custom tooltip on hover offers a
 *     link to parachord.com so first-time users know what to install.
 *
 * The default render (server + first client paint) is the
 * not-connected state, so SSR and hydration match. The presence hook
 * flips it once the WS opens.
 */
export function ParachordCtaButton({
  href,
  label,
  className,
  size = "default",
}: {
  href: string;
  label: string;
  className?: string;
  size?: "default" | "sm";
}) {
  const running = useParachordPresence();
  const sizing =
    size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  const iconSize =
    size === "sm" ? "size-3 fill-current" : "size-3.5 fill-current";
  const dotSize = size === "sm" ? "size-1.5" : "size-2";

  if (running) {
    return (
      <a
        href={href}
        className={cn(
          // Parachord brand purple — distinct from the neutral
          // `bg-primary` so the running state visually advertises
          // "this opens in Parachord."
          "inline-flex shrink-0 items-center gap-2 rounded-lg font-medium text-white transition-[filter] hover:brightness-110",
          sizing,
          className,
        )}
        style={{ backgroundColor: "#8b5cf6" }}
      >
        <span
          aria-hidden
          className={cn(
            "animate-pulse rounded-full bg-emerald-400",
            dotSize,
          )}
        />
        {label}
      </a>
    );
  }

  // Disabled state. Wrap in a Tooltip telling first-time users where
  // to get Parachord. The trigger is a span (not a button) because
  // disabled <button> elements don't fire pointer events in some
  // browsers, which would suppress the tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          aria-disabled="true"
          tabIndex={0}
          className={cn(
            "bg-muted text-muted-foreground inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-lg font-medium opacity-70",
            sizing,
            className,
          )}
        >
          <Play className={iconSize} />
          {label}
        </span>
      </TooltipTrigger>
      <GetParachordTooltipContent />
    </Tooltip>
  );
}

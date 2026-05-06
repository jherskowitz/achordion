"use client";

import { Play } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useParachordPresence } from "@/lib/use-parachord-presence";

const PARACHORD_HOMEPAGE = "https://parachord.com";

/**
 * Floating action button that appears on hover over a cover-art tile —
 * the bottom-right "Play" affordance used on every album grid.
 *
 * Two visual states, gated by `useParachordPresence` like the main
 * `ParachordCtaButton`:
 *
 *   • CONNECTED — Parachord brand purple, anchor that opens the
 *     parachord:// URL on click. Tooltip shows the play label.
 *
 *   • NOT CONNECTED — same shape, muted neutral, no navigation.
 *     Tooltip on hover offers a "Get Parachord →" link to
 *     parachord.com so first-time users have a path forward.
 *
 * Caller is responsible for the surrounding `group relative` cover
 * container; the fab fades in / slides up on `group-hover`.
 */
export function PlayOnHoverFab({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const running = useParachordPresence();

  // Shared base styles — only colors and pointer behaviour differ
  // between the two states. We keep `pointer-events-auto` even when
  // `opacity-0` so the tooltip / hover-fade can fire as soon as the
  // parent cover container is hovered.
  //
  // Touch-pointer override: `pointer-coarse:` variants force the fab
  // visible (and slightly bigger for the 44px tap-target floor) on
  // devices without a real hover state. Otherwise the affordance is
  // unreachable on phones because Tailwind's `hover:` rules sit
  // behind a `(hover: hover)` media query.
  const baseClasses =
    "absolute right-2 bottom-2 inline-flex size-9 translate-y-1 items-center justify-center rounded-full opacity-0 shadow-md transition-all group-hover:translate-y-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:translate-y-0 pointer-coarse:size-11 pointer-coarse:translate-y-0 pointer-coarse:opacity-100";

  if (running) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            aria-label={label}
            className={baseClasses}
            style={{
              backgroundColor: "var(--parachord-accent)",
              color: "white",
            }}
          >
            <Play className="size-4 fill-current" />
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
          className={`${baseClasses} bg-muted text-muted-foreground cursor-not-allowed`}
        >
          <Play className="size-4 fill-current" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-center">
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
    </Tooltip>
  );
}

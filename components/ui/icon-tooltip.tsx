import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pure-CSS tooltip wrapper for icon-shaped triggers (favicon links,
 * "+" tiles, etc.).
 *
 * Why this exists alongside the Radix `<Tooltip>` primitive:
 * Radix's `<TooltipTrigger asChild>` wraps the child in a Slot chain
 * that resolves to different element types under SSR vs client when a
 * browser extension (Parachord, dark-readers, ad-blockers) mutates
 * anchor attributes between render passes. That tree-shape mismatch
 * trips React's hydration error and tears down the whole client tree,
 * which has cascading consequences for unrelated client components in
 * the same Suspense subtree (e.g. FilterPills going un-clickable).
 *
 * This component avoids the issue entirely:
 *   - The trigger element (anchor / button) is rendered as itself,
 *     not slot-cloned. The extension's mutations stay confined to it.
 *   - The tooltip bubble is a sibling span shown via CSS
 *     `group-hover` / `group-focus-within`. Zero JavaScript, zero
 *     hydration concerns, zero state.
 *   - Visual styling matches the Radix Tooltip so users see one
 *     consistent tooltip aesthetic across the app.
 *
 * Usage:
 *   <IconTooltip label="Spotify">
 *     <a href="…" className="…">
 *       <img … />
 *     </a>
 *   </IconTooltip>
 *
 * The wrapper itself is an inline-flex `group` so the bubble shows
 * on hover/focus of any descendant. Position the bubble with `side`
 * (default: bottom).
 */
export function IconTooltip({
  label,
  children,
  side = "bottom",
  align = "center",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** Horizontal alignment relative to the trigger.
   *   "center" — bubble centered on the trigger (default).
   *   "start"  — bubble's left edge aligns with the trigger's left
   *              edge. Use when the trigger is near the page's
   *              left edge.
   *   "end"    — bubble's right edge aligns with the trigger's right
   *              edge. Use near the page's right edge. */
  align?: "center" | "start" | "end";
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={cn(
          // Base bubble styling. `max-w-[min(20rem,calc(100vw-1rem))]`
          // caps width at 320px on wide viewports but never wider than
          // the viewport itself minus a small gutter — so a long label
          // on a small phone wraps instead of overflowing horizontally.
          // Long labels also wrap onto multiple lines (no
          // `whitespace-nowrap`) so even a center-aligned bubble near
          // the page edge stays inside the viewport.
          "bg-foreground text-background pointer-events-none absolute z-50 w-max rounded-md px-2.5 py-1 text-xs font-medium opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          "max-w-[min(20rem,calc(100vw-1rem))]",
          side === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}

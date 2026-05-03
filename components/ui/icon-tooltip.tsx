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
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={cn(
          "bg-foreground text-background pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          side === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
        )}
      >
        {label}
      </span>
    </span>
  );
}

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline icon button rendered alongside track rows. Hidden by default,
 * fades in when its parent `<li className="group">` is hovered/focused.
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
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      className={cn(
        "text-muted-foreground hover:bg-foreground/10 hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
    >
      <Play className="size-3.5 fill-current" />
    </a>
  );
}

/**
 * Track-row cell that swaps a track number for a play button on
 * `group-hover`. Width and alignment are controlled by className so the
 * cell can adapt to the row's existing rhythm (e.g. `w-8 text-right` for
 * album tracklists, `w-5 text-center` for popular-tracks lists).
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
  const numberAlign =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
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
      <a
        href={href}
        title={label}
        aria-label={label}
        className="text-foreground absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Play className="size-3 fill-current" />
      </a>
    </span>
  );
}

/**
 * Filled CTA button used on album / playlist / station cards
 * — "Play in Parachord", "Open this radio in Parachord", etc.
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
  return (
    <a
      href={href}
      className={cn(
        "bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-2 rounded-lg font-medium hover:opacity-90",
        size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
        className,
      )}
    >
      <Play className={size === "sm" ? "size-3 fill-current" : "size-3.5 fill-current"} />
      {label}
    </a>
  );
}

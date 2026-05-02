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

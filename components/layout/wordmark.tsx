import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  href = "/explore",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      // Parachord's browser extension tags <a> elements with
      // `data-parachord-btn` before React hydrates, producing a
      // mismatch React 19 refuses to patch up — and on a client-
      // side nav this can cascade into a blank body. Suppress
      // hydration on every layout-chrome anchor so extension
      // mutations don't break navigation.
      suppressHydrationWarning
      className={cn(
        "inline-flex items-baseline gap-1 font-semibold tracking-tight",
        className,
      )}
    >
      <span className="text-lg">Achordion</span>
      <span className="text-muted-foreground text-xs font-normal">beta</span>
    </Link>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";
import { WordmarkMark } from "./wordmark-mark";

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
      aria-label="Achordion"
      className={cn(
        "text-foreground inline-flex items-center gap-1.5",
        className,
      )}
    >
      <WordmarkMark className="h-5 w-auto" />
      <span className="text-muted-foreground text-xs font-normal">
        beta
      </span>
    </Link>
  );
}

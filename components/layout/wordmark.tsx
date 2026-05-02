import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
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

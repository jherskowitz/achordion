import Link from "next/link";
import { cn } from "@/lib/utils";

export function YearPicker({
  current,
  years,
}: {
  current: number;
  years: number[];
}) {
  return (
    <div
      className="border-border/60 inline-flex rounded-xl border p-1 text-sm"
      role="radiogroup"
      aria-label="Year"
    >
      {years.map((y) => {
        const active = y === current;
        return (
          <Link
            key={y}
            href={`/explore/year-in-music?year=${y}`}
            scroll={false}
            aria-checked={active}
            role="radio"
            className={cn(
              "rounded-lg px-3 py-1 tabular-nums transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {y}
          </Link>
        );
      })}
    </div>
  );
}

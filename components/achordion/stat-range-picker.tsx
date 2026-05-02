"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { STAT_RANGE_LABELS, type StatRange } from "@/lib/types/stat-range";
import { cn } from "@/lib/utils";

const VISIBLE: StatRange[] = ["week", "month", "year", "all_time"];

export function StatRangePicker({ active }: { active: StatRange }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function makeHref(range: StatRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (range === "all_time") params.delete("range");
    else params.set("range", range);
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="border-border/60 bg-muted/40 inline-flex items-center rounded-lg border p-1"
    >
      {VISIBLE.map((range) => {
        const isActive = active === range;
        return (
          <Link
            key={range}
            href={makeHref(range)}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium transition-colors",
              "flex items-center justify-center",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {STAT_RANGE_LABELS[range]}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface FilterPillsProps<T extends string> {
  /** URL search-param key controlled by these pills. */
  param: string;
  active: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  /** Pass the value that should be omitted from the URL (the default). */
  defaultValue?: T;
  className?: string;
  ariaLabel?: string;
}

export function FilterPills<T extends string>({
  param,
  active,
  options,
  defaultValue,
  className,
  ariaLabel,
}: FilterPillsProps<T>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function makeHref(value: T) {
    const next = new URLSearchParams(searchParams.toString());
    if (defaultValue !== undefined && value === defaultValue) {
      next.delete(param);
    } else {
      next.set(param, value);
    }
    const qs = next.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "border-border/60 bg-muted/40 inline-flex items-center rounded-lg border p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = active === opt.value;
        return (
          <Link
            key={opt.value}
            href={makeHref(opt.value)}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            className={cn(
              "flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();

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
        const href = makeHref(opt.value);
        return (
          // <button> (not <a>) on purpose. Browser extensions —
          // Parachord's, ad-blockers, dark-readers, translators —
          // routinely mutate anchors after SSR, and any of those
          // mutations can cost us React's hydrated click handler,
          // leaving the pill un-clickable. Buttons are basically
          // never touched, so this is the most defensive shape.
          // Trade-off: no middle-click open-in-new-tab. Acceptable
          // for tab-style filter pills.
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              // Eager router.push (NOT wrapped in startTransition).
              // useTransition keeps the previous UI visible during
              // the navigation, which reads as "the pill click did
              // nothing" — same lesson as the FamiliaritySlider
              // (AGENTS.md "Recommendation filtering"). The
              // downstream Suspense boundary (e.g. DiscographySection
              // keyed on `type`) is the right feedback channel: with
              // an eager push it unmounts and shows its skeleton
              // immediately, telling the user the click registered.
              router.push(href, { scroll: false });
            }}
            className={cn(
              "flex h-7 cursor-pointer items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

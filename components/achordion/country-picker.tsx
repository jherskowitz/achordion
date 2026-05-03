"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

/** Internal shape: each option carries its own pre-built href so the
 *  client component never receives a function (RSC won't serialize
 *  functions across the server/client boundary). The caller builds
 *  hrefs on the server side and we just consume them. */
export interface CountryOptionWithHref extends CountryOption {
  href: string;
}

/**
 * Country dropdown for the chart pages.
 *
 * Was a `<details>`-based dropdown, but `<details>` doesn't close
 * when the user clicks an item inside — `<details>` only toggles
 * via its `<summary>`, so the navigation happened but the menu
 * stayed open until the user clicked the trigger again. This
 * client-side replacement closes on selection (state-driven), on
 * outside click, and on Escape, and routes via `<Link>` so
 * Next.js prefetches behave the same.
 *
 * Browser-extension hardening: Parachord's extension tags `<a>`
 * elements with `data-parachord-btn` before React hydrates, which
 * causes hydration mismatches that can cascade and break unrelated
 * client components in the same Suspense subtree. This picker is
 * structurally safe because the option `<Link>`s only render after
 * `open` flips true (state change post-hydration), so they're
 * absent from the SSR tree. We still apply `suppressHydrationWarning`
 * on the trigger button and the Links as belt-and-braces — same
 * pattern used on every other layout-chrome anchor in the app.
 */
export function CountryPicker({
  current,
  options,
}: {
  current: CountryOption;
  /** Each option carries a pre-built `href` — building URLs on the
   *  server side keeps the function-prop ban from RSC happy. */
  options: CountryOptionWithHref[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        suppressHydrationWarning
        className="border-border/60 hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-sm select-none"
      >
        <span aria-hidden>{current.flag}</span>
        {current.name}
        <span aria-hidden className="text-muted-foreground/70">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="border-border/60 bg-background absolute right-0 z-50 mt-2 max-h-[60vh] w-56 overflow-y-auto rounded-xl border p-1 shadow-lg"
        >
          {options.map((c) => {
            const active = c.code === current.code;
            return (
              <li key={c.code}>
                <Link
                  href={c.href}
                  scroll={false}
                  suppressHydrationWarning
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span aria-hidden>{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  {active && (
                    <span
                      aria-hidden
                      className="text-foreground/70 text-xs"
                    >
                      ✓
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

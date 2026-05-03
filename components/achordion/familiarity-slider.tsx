"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeFamiliarity } from "@/lib/familiarity";

/**
 * Slider that lets the listener bias a "Recommended" rail toward
 * familiar artists/tracks or pure discoveries. Drives a search
 * param (configurable via `param` prop) consumed by the explore
 * overview page so the artists rail and tracks rail can be tuned
 * independently.
 *
 * Value maps to a listen-count threshold — any artist or recording
 * whose all-time listen count exceeds the threshold is filtered out
 * of the recommendations. See `thresholdFromFamiliarity` for the
 * 11-bucket mapping.
 *
 * Self-discloses: collapsed by default behind a small "Filters"
 * toggle in the section header area; auto-opens when the user has
 * an override in the URL (so they can see what's active). Commits
 * on `mouseup` / `touchend` / `keyup` rather than `input` so each
 * drag produces one URL update + re-render rather than dozens.
 */

export function FamiliaritySlider({
  initial,
  param,
  label,
  kind = "artist",
  defaultValue = 50,
}: {
  initial: number;
  /** URL search-param key this slider owns (e.g. `artistsFamiliarity`,
   *  `tracksFamiliarity`). Lets two sliders coexist on one page. */
  param: string;
  /** Optional label shown when expanded. Defaults to "Filters". */
  label?: string;
  /** Whether this slider filters artists or tracks — drives the
   *  "Hide tracks I've listened to..." vs "Hide artists I've
   *  listened to..." copy. */
  kind?: "artist" | "track";
  /** Slider value at which the search param is dropped from the URL
   *  (i.e. the implicit default, so /?param=50 collapses to /). */
  defaultValue?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [v, setV] = useState(initial);
  // Auto-open when the user has tuned this slider away from the
  // default — otherwise their override is invisible behind a closed
  // disclosure and looks like nothing happened.
  const [open, setOpen] = useState(initial !== defaultValue);

  const overridden = v !== defaultValue;

  function commit(value: number) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) {
      next.delete(param);
    } else {
      next.set(param, String(value));
    }
    const qs = next.toString();
    // Eager replace (no transition wrapper) so the URL update fires
    // immediately and the keyed Suspense boundary downstream
    // re-suspends → user sees the skeleton flash → new data paints.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <SlidersHorizontal className="size-3" />
        <span>{label ?? "Filters"}</span>
        {overridden && (
          <span className="text-muted-foreground/70 hidden sm:inline">
            · {describeFamiliarity(v, kind)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-border/60 bg-muted/30 mt-2 rounded-lg border px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground/70 shrink-0 text-[10px] tracking-wide uppercase">
              Familiar
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={v}
              onChange={(e) => setV(Number(e.target.value))}
              onMouseUp={(e) => commit(Number(e.currentTarget.value))}
              onTouchEnd={(e) => commit(Number(e.currentTarget.value))}
              onKeyUp={(e) => commit(Number(e.currentTarget.value))}
              aria-label={label ?? "Familiarity threshold"}
              className="accent-foreground h-1 w-full cursor-pointer"
            />
            <span className="text-muted-foreground/70 shrink-0 text-[10px] tracking-wide uppercase">
              Discoveries
            </span>
          </div>
          <p className="text-muted-foreground/70 mt-1 text-[11px]">
            {describeFamiliarity(v, kind)}
          </p>
        </div>
      )}
    </div>
  );
}

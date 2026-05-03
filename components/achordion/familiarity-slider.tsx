"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
 * Commits on `mouseup` / `touchend` / `keyup` rather than `input` so
 * each drag produces one URL update + re-render rather than dozens.
 * router.replace + scroll: false keeps history clean.
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
  /** Section label shown to the left of the description, e.g.
   *  "Recommended artists settings". */
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
    // useTransition was keeping the previous UI visible during the
    // re-fetch, which read as "the slider doesn't do anything".
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="border-border/60 bg-muted/30 mb-4 flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">{label ?? "How familiar?"}</p>
        <p className="text-muted-foreground/70 text-xs">
          {describeFamiliarity(v, kind)}
        </p>
      </div>
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
        className="accent-foreground w-full cursor-pointer"
      />
      <div className="text-muted-foreground/70 flex justify-between text-[11px] tracking-wide uppercase">
        <span>Familiar</span>
        <span>Balanced</span>
        <span>Discoveries</span>
      </div>
    </div>
  );
}

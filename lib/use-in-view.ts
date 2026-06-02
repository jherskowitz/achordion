"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fire-once "is this element on (or near) screen?" hook.
 *
 * Attach the returned `ref` to an element; `inView` flips to `true` the
 * first time it scrolls within `rootMargin` of the viewport, then the
 * observer disconnects (one-shot — we only need the first reveal to
 * trigger a lazy fetch).
 *
 * Used to gate per-row `/api/track-cover` lookups so a long tracklist /
 * chart grid only resolves covers for rows the user actually sees,
 * instead of firing the whole list's worth on mount (which bursts MB's
 * 1-req/sec queue). `rootMargin` adds lookahead so a cover is already
 * loading by the time the row reaches the fold.
 *
 * SSR / environments without IntersectionObserver fall back to
 * `inView: true` (fetch normally) so nothing silently never-loads.
 */
export function useInViewOnce<T extends Element>(rootMargin = "300px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

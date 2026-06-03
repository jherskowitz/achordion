"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInViewOnce } from "@/lib/use-in-view";
import { limitCoverFetch } from "@/lib/cover-fetch-limiter";

/**
 * Full-bleed album cover tile that lazily resolves an `(artist,
 * album)` pair to a Cover Art Archive URL via `/api/track-cover`.
 *
 * Used by chart surfaces whose upstream source doesn't ship cover art
 * inline (NACC, similar text-only charts). When the upstream *does*
 * supply a cover URL — Earshot's cover-art dialog endpoint, Apple
 * Music's artworkUrl — pass it as `initialSrc` to short-circuit the
 * fetch and render straight away.
 *
 * The lookup *also* surfaces the resolved release-group MBID via
 * `onResolved`. Callers (chart cards, radio rows) use that to swap
 * their `href` from a `/release-group/lookup?artist=…&title=…`
 * fallback to a direct `/release-group/<mbid>` link once the MB
 * search returns. When `onResolved` is set, the fetch fires even
 * with `initialSrc` present so MBID lookup still happens for
 * inline-art sources like Apple Music.
 *
 * Server-side enrichment was the alternative; rejected because MB's
 * 1-req/sec rate limit would block first paint for tens of seconds
 * on a 30-row chart. Lazy-and-out-of-order is the right tradeoff:
 * the chart paints with placeholders, covers stream in over the
 * next few seconds, and Next caches per-(artist,album) tuple so a
 * returning visitor pays no MB cost at all.
 */
export function LazyAlbumCover({
  artist,
  album,
  alt,
  initialSrc,
  className,
  onResolved,
}: {
  artist: string;
  album: string;
  alt: string;
  initialSrc?: string | null;
  className?: string;
  /** Fires once when the lookup completes (resolved or null). Use
   *  the `mbid` to swap a lookup-href for a direct
   *  `/release-group/<mbid>` link. Keep this stable across renders
   *  (a `useState` setter, or a memoized callback) — putting it in
   *  the effect's deps would otherwise spam the network. */
  onResolved?: (data: { url: string | null; mbid: string | null }) => void;
}) {
  // Only resolve the cover once the tile is on/near screen — a long
  // chart grid mounts dozens of these, and firing them all on mount
  // bursts MB's 1-req/sec queue. The placeholder (rendered until `src`)
  // carries the observer ref.
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);
  const [errored, setErrored] = useState(false);
  // Fade-in once the image's bytes land. See `<CoverArt>` for the
  // same pattern — keeps the placeholder→real-image swap from
  // snapping, and re-fires when src changes (initialSrc → fetched
  // URL) so chart grids stay calm during cover-streaming.
  const [loaded, setLoaded] = useState(false);
  // Reset fade state when src changes (initialSrc → fetched URL) —
  // textbook prop-driven reset. Lint rule still warns.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
  }, [src]);

  // Capture the latest onResolved in a ref so it doesn't have to be
  // a useEffect dep. Callers can pass an inline callback without
  // triggering refetches on each render. The ref is intentionally
  // mutated during render — the lint rule is conservative here, but
  // mirroring the latest callback on every render is the documented
  // way to read "current" inside an effect that doesn't depend on it.
  const onResolvedRef = useRef(onResolved);
  // eslint-disable-next-line react-hooks/refs
  onResolvedRef.current = onResolved;

  useEffect(() => {
    // Skip the network call only when we already have a known cover
    // URL AND nobody is asking for the MBID. With an `onResolved`
    // listener we still need to fetch even if the cover's set —
    // otherwise inline-art callers (Apple Music) would never learn
    // their MBID.
    const callback = onResolvedRef.current;
    if (initialSrc && !callback) return;
    // Gate the from-scratch cover lookup (no initialSrc) on visibility —
    // that's the burst source. initialSrc+callback rows already show a
    // cover and only fetch for the MBID; let those proceed (still
    // capped by the limiter) since their placeholder ref never mounts.
    if (!initialSrc && !inView) return;

    let cancelled = false;
    // /api/track-cover takes title + optional album; for album-only
    // lookups we pass the album as both — the endpoint's
    // release-group branch only consults `album` in that case.
    const params = new URLSearchParams({
      artist,
      title: album,
      album,
    });
    // Route through the page-wide limiter so a scroll-through can't
    // open dozens of cover requests at once.
    limitCoverFetch(() => {
      if (cancelled) return Promise.resolve({ url: null, mbid: null });
      return fetch(`/api/track-cover?${params}`).then((r) =>
        r.ok ? r.json() : { url: null, mbid: null },
      );
    })
      .then((data: { url: string | null; mbid: string | null }) => {
        if (cancelled) return;
        // Don't overwrite a known-good initialSrc — Earshot's
        // cover-dialog URLs aren't on CAA; the API's URL would be
        // a worse match. Only fill in when we had no source yet.
        if (data.url && !initialSrc) setSrc(data.url);
        callback?.({ url: data.url ?? null, mbid: data.mbid ?? null });
      })
      .catch(() => {
        // Silent — placeholder stays. onResolved isn't called on
        // failure since we don't know the MBID either way.
      });
    return () => {
      cancelled = true;
    };
  }, [artist, album, initialSrc, inView]);

  // One layered tile for every state: the Disc3 placeholder sits behind
  // the image and stays visible until the image's bytes load, so the
  // resolve never flashes a blank box (placeholder → cover, never
  // placeholder → blank → cover). The container always carries the
  // in-view observer ref. `group-hover:opacity-90` dims the whole tile.
  return (
    <div
      ref={ref}
      className={cn(
        "bg-muted text-muted-foreground/40 relative aspect-square w-full overflow-hidden transition-opacity group-hover:opacity-90",
        className,
      )}
    >
      {(!src || errored || !loaded) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Disc3 className="size-1/3" aria-hidden />
        </span>
      )}
      {src && !errored && (
        <Image
          src={src}
          alt={alt}
          width={500}
          height={500}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out",
            loaded ? "opacity-100" : "opacity-0",
          )}
          unoptimized
        />
      )}
    </div>
  );
}

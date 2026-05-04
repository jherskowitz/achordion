"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);
  const [errored, setErrored] = useState(false);
  // Fade-in once the image's bytes land. See `<CoverArt>` for the
  // same pattern — keeps the placeholder→real-image swap from
  // snapping, and re-fires when src changes (initialSrc → fetched
  // URL) so chart grids stay calm during cover-streaming.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Capture the latest onResolved in a ref so it doesn't have to be
  // a useEffect dep. Callers can pass an inline callback without
  // triggering refetches on each render.
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    // Skip the network call only when we already have a known cover
    // URL AND nobody is asking for the MBID. With an `onResolved`
    // listener we still need to fetch even if the cover's set —
    // otherwise inline-art callers (Apple Music) would never learn
    // their MBID.
    const callback = onResolvedRef.current;
    if (initialSrc && !callback) return;

    let cancelled = false;
    // /api/track-cover takes title + optional album; for album-only
    // lookups we pass the album as both — the endpoint's
    // release-group branch only consults `album` in that case.
    const params = new URLSearchParams({
      artist,
      title: album,
      album,
    });
    fetch(`/api/track-cover?${params}`)
      .then((r) =>
        r.ok ? r.json() : { url: null, mbid: null },
      )
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
  }, [artist, album, initialSrc]);

  if (!src || errored) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground/40 flex aspect-square w-full items-center justify-center transition-opacity group-hover:opacity-90",
          className,
        )}
      >
        <Disc3 className="size-1/3" aria-hidden />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={500}
      height={500}
      onLoad={() => setLoaded(true)}
      onError={() => setErrored(true)}
      className={cn(
        // `transition-opacity` covers both the load fade-in (controlled
        // by the `loaded` state) and the existing `group-hover` dim.
        // 300ms ease-out feels faster than the default 150ms but still
        // soft enough not to read as a jump.
        "aspect-square w-full object-cover transition-opacity duration-300 ease-out group-hover:opacity-90",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
      unoptimized
    />
  );
}

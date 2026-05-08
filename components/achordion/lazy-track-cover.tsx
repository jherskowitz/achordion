"use client";

import { useEffect, useRef, useState } from "react";
import { CoverArt } from "./cover-art";

/**
 * Cover-art tile that lazily resolves an artist/title/album triple
 * to a CAA URL via `/api/track-cover` on mount.
 *
 * Why client-side lazy: surfaces like the spinbin-fed radio-rewind
 * playlists arrive with freeform text and no MBIDs. A server-side
 * batch enrichment would have to issue one MB lookup per unique
 * album, and MB's 1-req-per-second rate limit would block the page
 * paint for tens of seconds on a 50-track station. Doing it lazily
 * paints the tracklist instantly and lets covers stream in over
 * the next several seconds — out of order is fine.
 *
 * Falls back to a CoverArt placeholder (Disc3 glyph) when the API
 * returns no URL or the request fails. CoverArt's own onError
 * handler covers the case where the CAA URL itself 404s, so we
 * never paint a broken-image glyph.
 *
 * Pass `initialSrc` when the upstream feed already supplied a cover
 * URL — saves a round trip and renders the known-good URL straight
 * away.
 */
export function LazyTrackCover({
  artist,
  title,
  album,
  alt,
  size = 40,
  initialSrc,
  onResolved,
}: {
  artist: string;
  title: string;
  album?: string | null;
  alt: string;
  size?: number;
  initialSrc?: string | null;
  /** Fires once when the lookup completes (resolved or null). Use
   *  the `mbid` to swap a lookup-href for a direct
   *  `/release-group/<mbid>` link. Same callback semantics as
   *  `<LazyAlbumCover>` — see that file for details. */
  onResolved?: (data: { url: string | null; mbid: string | null }) => void;
}) {
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);
  // Mirror the latest callback into a ref so the effect below doesn't
  // need it as a dep. The lint rule is conservative about ref writes
  // during render, but this is the documented React pattern for
  // "read current callback inside an effect."
  const onResolvedRef = useRef(onResolved);
  // eslint-disable-next-line react-hooks/refs
  onResolvedRef.current = onResolved;

  useEffect(() => {
    // Skip the network call only when we already have a known cover
    // URL AND nobody is asking for the MBID — otherwise even sources
    // that ship a cover (spinbin) would never learn the MBID.
    const callback = onResolvedRef.current;
    if (initialSrc && !callback) return;

    let cancelled = false;
    const params = new URLSearchParams({ artist, title });
    if (album) params.set("album", album);
    fetch(`/api/track-cover?${params}`)
      .then((r) => (r.ok ? r.json() : { url: null, mbid: null }))
      .then((data: { url: string | null; mbid: string | null }) => {
        if (cancelled) return;
        if (data.url && !initialSrc) setSrc(data.url);
        callback?.({ url: data.url ?? null, mbid: data.mbid ?? null });
      })
      .catch(() => {
        // Silent — CoverArt placeholder stays.
      });
    return () => {
      cancelled = true;
    };
  }, [artist, title, album, initialSrc]);

  return <CoverArt src={src} alt={alt} size={size} />;
}

"use client";

import { useEffect, useState } from "react";
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
}: {
  artist: string;
  title: string;
  album?: string | null;
  alt: string;
  size?: number;
  initialSrc?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);

  useEffect(() => {
    if (initialSrc) return;
    let cancelled = false;
    const params = new URLSearchParams({ artist, title });
    if (album) params.set("album", album);
    fetch(`/api/track-cover?${params}`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((data: { url: string | null }) => {
        if (!cancelled && data.url) setSrc(data.url);
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

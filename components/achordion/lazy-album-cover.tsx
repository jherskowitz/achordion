"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
}: {
  artist: string;
  album: string;
  alt: string;
  initialSrc?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (initialSrc) return;
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
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((data: { url: string | null }) => {
        if (!cancelled && data.url) setSrc(data.url);
      })
      .catch(() => {
        // Silent — placeholder stays.
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
      className={cn(
        "aspect-square w-full object-cover transition-opacity group-hover:opacity-90",
        className,
      )}
      onError={() => setErrored(true)}
      unoptimized
    />
  );
}

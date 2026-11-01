"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dicebearShapesUrl } from "@/lib/dicebear-shapes";
import { cn } from "@/lib/utils";

/**
 * Client-side artist avatar with non-blocking Wikidata image lookup.
 *
 * Paints DiceBear immediately (so the row never waits) and swaps in
 * the real Wikidata thumbnail once `/api/artist-image` resolves. The
 * server-side `<ArtistAvatar>` is the right tool when you have one
 * artist (hero, sidebar primary). For lists of N artists this avoids
 * N rate-limited MusicBrainz round-trips on the server render path.
 */
export function LazyArtistAvatar({
  mbid,
  name,
  className,
  fallbackClassName,
  width = 128,
}: {
  /** Artist MBID when known. When null/absent (e.g. a ListenBrainz
   *  stats row that never mapped to an MBID), we skip the image lookup
   *  and paint a name-seeded DiceBear instead of a blank circle. */
  mbid?: string | null;
  name: string;
  className?: string;
  fallbackClassName?: string;
  width?: number;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    // No MBID → nothing to look up (the Wikidata/fanart chain is MBID-
    // keyed); the name-seeded DiceBear below is the final fallback.
    if (!mbid) return;
    let cancelled = false;
    fetch(`/api/artist-image?mbid=${mbid}&width=${width}`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((data: { url: string | null }) => {
        if (!cancelled && data.url) setImageUrl(data.url);
      })
      .catch(() => {
        // Silent — DiceBear placeholder stays.
      });
    return () => {
      cancelled = true;
    };
  }, [mbid, width]);
  const initial = name.slice(0, 1).toUpperCase();
  // AvatarImage's `src` falls through to AvatarFallback when the URL
  // 404s. We paint the resolved image (Wikidata/fanart) when we have it,
  // else a DiceBear shape — seeded by MBID when known (stable, matches
  // the server <ArtistAvatar> + OG image) and by name otherwise so a
  // mbid-less artist still gets a deterministic avatar, not a blank.
  // The initial letter stays as the absolute last-resort.
  const src = imageUrl ?? dicebearShapesUrl(mbid || name);
  return (
    <Avatar className={cn("size-10 shrink-0", className)}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback className={cn("text-xs", fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dicebearShapesUrl } from "@/lib/dicebear-shapes";
import { cn } from "@/lib/utils";

/**
 * Client-side artist avatar with non-blocking image lookup.
 *
 * Paints DiceBear immediately (so the row never waits) and swaps in the real
 * Wikidata/fanart.tv thumbnail once `/api/artist-image` resolves. The
 * server-side `<ArtistAvatar>` is the right tool when you have one artist
 * (hero, sidebar primary). For lists of N artists this avoids N rate-limited
 * MusicBrainz round-trips on the server render path.
 */
export function LazyArtistAvatar({
  mbid,
  name,
  className,
  fallbackClassName,
  width = 128,
}: {
  /** Artist MBID when known. When null/absent (e.g. a ListenBrainz stats row
   *  that never mapped to one), we look up by `name` instead — the API
   *  resolves name→MBID server-side — so the real photo still shows. */
  mbid?: string | null;
  name: string;
  className?: string;
  fallbackClassName?: string;
  width?: number;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    // Look up by MBID when we have one; otherwise by name, which the API
    // resolves to an MBID server-side (rate-limited + cached) so a MBID-less
    // row can still reach the MBID-keyed Wikidata/fanart chain. Both are the
    // same quoted search the name-link's /artist/lookup uses. See #106.
    const query = mbid
      ? `mbid=${encodeURIComponent(mbid)}&width=${width}`
      : name
        ? `name=${encodeURIComponent(name)}&width=${width}`
        : null;
    if (!query) return;
    let cancelled = false;
    fetch(`/api/artist-image?${query}`)
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
  }, [mbid, name, width]);
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

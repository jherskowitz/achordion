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
  mbid: string;
  name: string;
  className?: string;
  fallbackClassName?: string;
  width?: number;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
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
  // 404s. We paint Wikidata when we have it, DiceBear otherwise; the
  // initial letter stays as the absolute last-resort.
  const src = imageUrl ?? dicebearShapesUrl(mbid);
  return (
    <Avatar className={cn("size-10 shrink-0", className)}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback className={cn("text-xs", fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

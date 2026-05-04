import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getArtist,
  partitionArtistRelations,
  type ArtistDetail,
} from "@/lib/clients/musicbrainz";
import { getArtistImageFromWikidata } from "@/lib/clients/wikidata";
import { dicebearShapesUrl } from "@/lib/dicebear-shapes";

interface ArtistAvatarProps {
  /** Artist MBID — used as the DiceBear fallback seed and to look up
   *  Wikidata when no `artist` is passed in. */
  mbid: string;
  /** Display name used for alt text and the initial fallback. */
  name: string;
  /**
   * Pre-fetched MB artist detail. Pass when the caller already has
   * the full artist (so we share a single MB request via Next's auto-
   * dedupe) — the artist page does this. Otherwise we fetch on demand.
   */
  artist?: ArtistDetail | null;
  /** Tailwind sizing class (e.g. "size-9"). */
  className?: string;
  fallbackClassName?: string;
  /** Width passed to Commons' resizer. Default 512 covers hero avatars. */
  width?: number;
}

async function resolveImageUrl(
  mbid: string,
  artist: ArtistDetail | null | undefined,
  width: number,
): Promise<string | null> {
  let detail = artist;
  if (!detail) {
    try {
      detail = await getArtist(mbid);
    } catch {
      return null;
    }
  }
  const { urls } = partitionArtistRelations(detail);
  const wikidataUrl = urls.find((u) => /wikidata\.org/i.test(u.url))?.url;
  if (!wikidataUrl) return null;
  return getArtistImageFromWikidata(wikidataUrl, width);
}

/**
 * Avatar for an MB artist. Self-resolves: looks up the artist's
 * Wikidata link via MB url-rels, fetches the P18 image filename, and
 * builds a Commons-hosted thumbnail. Falls back to a DiceBear shape
 * keyed by MBID when there's no Wikidata image. Always async — wrap
 * in Suspense at the call site if you don't want to block the parent.
 *
 * Next's request-scoped fetch dedupe means multiple ArtistAvatars on
 * the same page (or page + sidebar) for the same MBID share a single
 * MB request. The MB and Wikidata caches make repeat visits ~free.
 */
export async function ArtistAvatar({
  mbid,
  name,
  artist,
  className,
  fallbackClassName,
  // 256px covers the largest place we render this avatar (the artist
  // page hero at size-24 = 96px CSS, which is 288px on a 3× mobile)
  // with a small headroom for retina, and Wikipedia/Wikidata round-
  // up to ~320px on the standard thumbnail ladder. Asking for 512
  // here was triggering Wikipedia to serve the 960px cached variant
  // — ~280KB instead of ~30KB on artist hero loads. Lighthouse
  // image-delivery-insight flagged this as ~95% wasted bytes on the
  // largest image on the artist page. Callers that legitimately need
  // a bigger size (none today) can override via the `width` prop.
  width = 256,
}: ArtistAvatarProps) {
  const imageUrl = await resolveImageUrl(mbid, artist, width);
  const src = imageUrl ?? dicebearShapesUrl(mbid);
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback className={fallbackClassName}>{initial}</AvatarFallback>
    </Avatar>
  );
}

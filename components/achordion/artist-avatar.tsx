import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getArtist,
  partitionArtistRelations,
  type ArtistDetail,
} from "@/lib/clients/musicbrainz";
import { getArtistImageFromWikidata } from "@/lib/clients/wikidata";
import { getArtistImageFromFanart } from "@/lib/clients/fanart";
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

/** Where the resolved image URL came from. Surfaces to the artist
 *  page so it can attribute fanart.tv per their ToS. */
export type ArtistImageSource = "wikidata" | "fanart" | null;

export interface ResolvedArtistImage {
  url: string | null;
  source: ArtistImageSource;
}

/**
 * Resolve an MB artist MBID to an image URL with provenance. Tries
 * Wikidata `P18` → fanart.tv `artistthumb` in that order. Wikidata
 * has the better "uses Wikipedia photo" coverage; fanart.tv covers
 * pop / contemporary / electronic where Wikidata is sparse.
 *
 * Returns `{ url, source }` so callers that need to credit fanart.tv
 * (per their ToS) know whether the displayed image came from there.
 *
 * Exported separately because the artist page calls this directly to
 * decide whether to add the fanart.tv attribution link. The avatar
 * component below uses the same helper.
 */
export async function resolveArtistImage(
  mbid: string,
  artist: ArtistDetail | null | undefined,
  width: number,
): Promise<ResolvedArtistImage> {
  let detail = artist;
  if (!detail) {
    try {
      detail = await getArtist(mbid);
    } catch {
      // MB unreachable — fall through to the fanart attempt below
      // since fanart accepts the raw MBID without the MB roundtrip.
    }
  }
  if (detail) {
    const { urls } = partitionArtistRelations(detail);
    const wikidataUrl = urls.find((u) => /wikidata\.org/i.test(u.url))?.url;
    if (wikidataUrl) {
      const wd = await getArtistImageFromWikidata(wikidataUrl, width).catch(
        () => null,
      );
      if (wd) return { url: wd, source: "wikidata" };
    }
  }
  const fa = await getArtistImageFromFanart(mbid).catch(() => null);
  if (fa) return { url: fa, source: "fanart" };
  return { url: null, source: null };
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
  const { url } = await resolveArtistImage(mbid, artist, width);
  const src = url ?? dicebearShapesUrl(mbid);
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback className={fallbackClassName}>{initial}</AvatarFallback>
    </Avatar>
  );
}

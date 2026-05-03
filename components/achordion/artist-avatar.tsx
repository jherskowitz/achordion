import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getArtistImageFromWikidata } from "@/lib/clients/wikidata";
import { dicebearShapesUrl } from "@/lib/dicebear-shapes";

interface ArtistAvatarProps {
  /** Artist MBID — used as the DiceBear seed when Wikidata has nothing. */
  mbid: string;
  /** Display name used for the alt text and initial fallback. */
  name: string;
  /**
   * Wikidata URL pulled from MB's url-rels for this artist. When
   * present, we fetch the artist's P18 (image) claim and serve a
   * Commons-hosted thumbnail. Null/undefined skips the lookup.
   */
  wikidataUrl?: string | null;
  /** Tailwind sizing class (e.g. "size-20"). */
  className?: string;
  fallbackClassName?: string;
  /**
   * Image width passed to Commons' `Special:FilePath?width=` resizer.
   * Default 512px is enough for the largest header avatar (80px @ 2x);
   * smaller call sites can request 256 to keep the payload tight.
   */
  width?: number;
}

/**
 * Avatar for artists. Tries Wikidata's P18 → Commons FilePath URL
 * first; falls back to a deterministic DiceBear SVG seeded by the
 * artist's MBID so each artist gets a stable, Parachord-coloured
 * placeholder. Async server component — feel free to wrap in Suspense
 * at the call site if the Wikidata lookup is on the critical path.
 */
export async function ArtistAvatar({
  mbid,
  name,
  wikidataUrl,
  className,
  fallbackClassName,
  width = 512,
}: ArtistAvatarProps) {
  const imageUrl = await getArtistImageFromWikidata(wikidataUrl, width);
  const src = imageUrl ?? dicebearShapesUrl(mbid);
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback className={fallbackClassName}>{initial}</AvatarFallback>
    </Avatar>
  );
}

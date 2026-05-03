import { getArtist, partitionArtistRelations } from "@/lib/clients/musicbrainz";
import { getArtistImageFromWikidata } from "@/lib/clients/wikidata";

// Browser cache: 1h fresh, 24h stale-while-revalidate. Wikidata
// images change rarely; a stale response in flight is fine.
const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
};

/**
 * Resolve an MB artist MBID to a Wikidata-hosted thumbnail URL.
 *
 * Server-side because the resolution chain (MB → url-rels → Wikidata
 * QID → Wikidata claims → Commons File:Path → upload.wikimedia.org)
 * involves several private-cache GETs we don't want exposed via CORS.
 *
 * Used by the search typeahead to lazy-fill artist avatars after the
 * row has already painted with a DiceBear placeholder — so the image
 * fetch never blocks the search results from showing.
 *
 * Returns `{ url: string | null }`. Null when the artist has no
 * Wikidata link or the image lookup fails. Caller falls back to
 * the placeholder.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim() ?? "";
  const widthRaw = url.searchParams.get("width");
  const width = widthRaw ? parseInt(widthRaw, 10) : 128;
  if (!mbid) return Response.json({ url: null }, { status: 400 });

  try {
    const artist = await getArtist(mbid);
    const { urls } = partitionArtistRelations(artist);
    const wikidataUrl = urls.find((u) => /wikidata\.org/i.test(u.url))?.url;
    if (!wikidataUrl)
      return Response.json({ url: null }, { headers: CACHE_HEADERS });
    const imageUrl = await getArtistImageFromWikidata(
      wikidataUrl,
      Number.isFinite(width) ? width : 128,
    );
    return Response.json(
      { url: imageUrl ?? null },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json({ url: null }, { headers: CACHE_HEADERS });
  }
}

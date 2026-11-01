import { resolveArtistImage } from "@/components/achordion/artist-avatar";
import { checkRateLimit } from "@/lib/rate-limit";

// Browser cache: 1h fresh, 24h stale-while-revalidate. Artist images
// change rarely; a stale response in flight is fine.
const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
};

/**
 * Resolve an MB artist MBID to a hosted thumbnail URL.
 *
 * Delegates to the SAME `resolveArtistImage` pipeline the artist-page
 * hero and the OG image use — Wikidata `P18` → fanart.tv `artistthumb`
 * → null — so a lazy list/typeahead avatar gets identical coverage to
 * the hero. (It previously did only the Wikidata half, so fanart-only
 * artists showed a real photo on their page but a DiceBear in every
 * list.) Server-side because that chain makes several private-cache
 * GETs we don't want exposed via CORS.
 *
 * Returns `{ url: string | null }`. Null when neither source has an
 * image; the client falls back to a DiceBear placeholder.
 */
export async function GET(request: Request) {
  const limit = await checkRateLimit("image", request);
  if (!limit.ok) {
    return Response.json({ url: null }, { status: 429 });
  }

  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim() ?? "";
  const widthRaw = url.searchParams.get("width");
  const width = widthRaw ? parseInt(widthRaw, 10) : 128;
  if (!mbid) return Response.json({ url: null }, { status: 400 });

  try {
    const { url: imageUrl } = await resolveArtistImage(
      mbid,
      undefined,
      Number.isFinite(width) ? width : 128,
    );
    return Response.json({ url: imageUrl ?? null }, { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ url: null }, { headers: CACHE_HEADERS });
  }
}

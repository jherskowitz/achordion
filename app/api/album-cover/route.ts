import { checkRateLimit } from "@/lib/rate-limit";
import { getAlbumArtwork, getTrackArtwork } from "@/lib/clients/album-art";

/**
 * Catalog cover-art fallback: `(artist, album)` or `(artist, track)` →
 * a streaming-catalog artwork URL (iTunes → Deezer). Fetched CLIENT-
 * side by <CoverArt> / <LazyAlbumCover> only when the primary Cover Art
 * Archive image fails to load — CAA's archive.org nodes flake on fresh
 * releases, and CAA lacks art for many new/niche albums entirely.
 *
 * Distinct from /api/track-cover, which resolves an MBID + CAA URL via
 * MusicBrainz. This one never touches MB/CAA — it's the independent
 * catalog source, so it stays up when MB/CAA are unreachable or empty.
 * Returns `{ url: string | null }`; a null means neither catalog had it.
 */
const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: Request) {
  // Same per-IP cover limiter as /api/track-cover — one client can't
  // burst hundreds of catalog lookups.
  const limit = await checkRateLimit("cover", request);
  if (!limit.ok) return Response.json({ url: null }, { status: 429 });

  const url = new URL(request.url);
  const artist = url.searchParams.get("artist")?.trim() ?? "";
  const album = url.searchParams.get("album")?.trim() ?? "";
  const track = url.searchParams.get("track")?.trim() ?? "";

  // Need an artist plus one of album/track. 400 isn't cached.
  if (!artist || (!album && !track)) {
    return Response.json({ url: null }, { status: 400 });
  }

  // getAlbumArtwork / getTrackArtwork are already fail-soft (null on any
  // error), so no try/catch needed — a miss is a cacheable null.
  const cover = album
    ? await getAlbumArtwork(artist, album)
    : await getTrackArtwork(artist, track);

  return Response.json({ url: cover }, { headers: CACHE_HEADERS });
}

import {
  searchRecordings,
  searchReleaseGroups,
} from "@/lib/clients/musicbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Resolve `(artist, title, optional album)` to a Cover Art Archive
 * URL. Used by surfaces — radio-rewind tracklists are the main one
 * — that get tracks as freeform text from third-party feeds and
 * have no MBID to start with.
 *
 * Strategy:
 *   1. If `album` is provided, search MB release-groups for
 *      `release:"album" AND artist:"artist"`. First hit's MBID
 *      becomes the CAA URL. Best-fidelity match.
 *   2. Otherwise (or if rg search came up empty), search MB
 *      recordings for `recording:"title" AND artist:"artist"` and
 *      use the first hit's release-group MBID if MB included one.
 *      Recordings sometimes don't surface release info on search
 *      results, in which case we give up.
 *
 * Both paths go through `mbFetch` which serializes against MB's
 * 1 req/sec rate limit and caches per-URL via Next's data cache, so
 * repeat lookups for the same (artist, album) tuple cost nothing
 * after the first hit. Returns `{ url: string | null }`.
 *
 * Caching stack:
 *   - Next data cache (server, all users) — 1h fresh window matching
 *     `searchReleaseGroups`'s revalidate. Tag-bustable.
 *   - Browser cache via Cache-Control on this response — 1h fresh,
 *     24h stale-while-revalidate. So a returning visitor gets the
 *     cover from disk for an hour with no network at all, and even
 *     stale-but-still-correct entries up to a day with a background
 *     revalidate. Cover-art URLs are basically immutable, so this
 *     is safe.
 */

const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: Request) {
  // Per-IP rate limit before any work — a single client can't burn
  // our MB queue with 1000 cover lookups in a few seconds.
  const limit = await checkRateLimit("cover", request);
  if (!limit.ok) {
    return Response.json({ url: null }, { status: 429 });
  }

  const url = new URL(request.url);
  const artist = url.searchParams.get("artist")?.trim() ?? "";
  const title = url.searchParams.get("title")?.trim() ?? "";
  const album = url.searchParams.get("album")?.trim() ?? "";
  if (!artist || !title)
    // 400 is not cached; missing-arg requests don't make sense to
    // memoize and we want bad callers to fix themselves.
    return Response.json({ url: null }, { status: 400 });

  // Quote tokens so MB lucene treats them as exact-phrase matches.
  // Otherwise a multi-word artist like "The National" gets OR'd
  // across "the" / "national" and pulls in irrelevant groups.
  const quoted = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

  try {
    if (album) {
      const q = `release:${quoted(album)} AND artist:${quoted(artist)}`;
      const results = await searchReleaseGroups(q, 4);
      const top = results.find((r) => r["primary-type"] === "Album") ?? results[0];
      if (top?.id) {
        return Response.json(
          { url: caaReleaseGroupUrl(top.id, 250) },
          { headers: CACHE_HEADERS },
        );
      }
    }
    // Fall through to recording-search when no album OR rg search
    // came up dry. Note MB's recording search doesn't include release
    // metadata in the response shape we parse, so this branch is
    // almost always going to land on `null`. Kept for the "no album
    // info" case so we tried.
    const rec = await searchRecordings(
      `recording:${quoted(title)} AND artist:${quoted(artist)}`,
      3,
    );
    if (rec.length > 0) {
      // Recording search response doesn't include release info via
      // our schema; would need a follow-up getRecording per hit.
      // Skip rather than blow the rate limit on a low-success path.
      return Response.json({ url: null }, { headers: CACHE_HEADERS });
    }
    return Response.json({ url: null }, { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ url: null }, { headers: CACHE_HEADERS });
  }
}

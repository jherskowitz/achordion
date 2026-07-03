import {
  getRecording,
  searchReleaseGroups,
  withLookupDeadline,
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
  const mbid = url.searchParams.get("mbid")?.trim() ?? "";
  if (!artist || !title)
    // 400 is not cached; missing-arg requests don't make sense to
    // memoize and we want bad callers to fix themselves.
    return Response.json({ url: null, mbid: null }, { status: 400 });

  const nullResponse = () =>
    Response.json({ url: null, mbid: null }, { headers: CACHE_HEADERS });

  // Recording-MBID path — mirrors the recording page: look the recording
  // up, take its release-group, build the CAA URL. This is how a caller
  // that HAS an MBID but no album (e.g. a pin whose ListenBrainz mapping
  // left it without a release) gets the same art the recording page
  // shows. Tried first; falls through to the album search below if it
  // finds nothing.
  if (mbid) {
    try {
      const resolved = await withLookupDeadline(
        (async (): Promise<{ url: string; mbid: string } | null> => {
          const rec = await getRecording(mbid);
          const rg = (rec.releases ?? [])
            .map((r) => r["release-group"])
            .find((g) => g?.id);
          return rg?.id
            ? { url: caaReleaseGroupUrl(rg.id, 250), mbid: rg.id }
            : null;
        })(),
      );
      if (resolved) return Response.json(resolved, { headers: CACHE_HEADERS });
    } catch {
      // MB error / deadline → fall through to the album search.
    }
  }

  // Quote tokens so MB lucene treats them as exact-phrase matches.
  // Otherwise a multi-word artist like "The National" gets OR'd
  // across "the" / "national" and pulls in irrelevant groups.
  const quoted = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

  // No album → no way to resolve a cover. (A recording search can't
  // help: MB's recording-search response doesn't carry release-group
  // info in the schema we parse, so that path always returned null —
  // it was a pure wasted MB call that only added load to the shared
  // 1-req/sec queue. Dropped.)
  if (!album) return nullResponse();

  try {
    // Bound the whole MB resolution on a wall clock. /api/track-cover
    // is fired in bursts (a radio-rewind tracklist requests a cover per
    // row), and every call serializes through the per-instance
    // 1-req/sec MB queue — so under load a request can sit in the queue
    // for tens of seconds and blow past Vercel's function limit, which
    // surfaced as a 5xx spike (the inner try/catch can't catch a
    // function timeout). withLookupDeadline makes the function return a
    // graceful 200 null within ~7s instead; the cover just falls back
    // to its placeholder. A cover is cosmetic — never worth a 504.
    const resolved = await withLookupDeadline(
      (async (): Promise<{ url: string; mbid: string } | null> => {
        const q = `release:${quoted(album)} AND artist:${quoted(artist)}`;
        const results = await searchReleaseGroups(q, 4);
        const top =
          results.find((r) => r["primary-type"] === "Album") ?? results[0];
        // Surface the resolved release-group MBID alongside the URL so
        // callers (chart cards) can swap their href from a
        // /release-group/lookup fallback to a direct /release-group/<mbid>.
        return top?.id ? { url: caaReleaseGroupUrl(top.id, 250), mbid: top.id } : null;
      })(),
    );
    return resolved
      ? Response.json(resolved, { headers: CACHE_HEADERS })
      : nullResponse();
  } catch {
    // MB error OR deadline exceeded → graceful null, fast.
    return nullResponse();
  }
}

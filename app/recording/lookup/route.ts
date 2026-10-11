import {
  searchRecordings,
  withLookupDeadline,
} from "@/lib/clients/musicbrainz";
import { cachedRedirect } from "@/lib/lookup-redirect";

/**
 * Resolve `?artist=…&title=…` to a MusicBrainz recording MBID and
 * redirect to /recording/<mbid>. Mirrors /release-group/lookup —
 * deferred resolution so chart rows / scrobble fallbacks don't hit
 * MB's 1 req/sec rate limit at render time.
 *
 * Falls back to /search?q=… on no match so users always land
 * somewhere useful.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const artist = url.searchParams.get("artist")?.trim() ?? "";
  const title = url.searchParams.get("title")?.trim() ?? "";
  if (!artist || !title) {
    // RSC prefetch hits these eagerly — empty params shouldn't 400.
    // Redirect to /search with whatever we have so the user lands
    // somewhere useful and the logs stay quiet.
    const fallback = title || artist;
    return cachedRedirect(
      new URL(
        fallback ? `/search?q=${encodeURIComponent(fallback)}` : "/search",
        request.url,
      ),
      { matched: false },
    );
  }
  try {
    const q = `recording:"${title.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
    const results = await withLookupDeadline(searchRecordings(q, 5));
    const top = results[0];
    if (top?.id) {
      return cachedRedirect(new URL(`/recording/${top.id}`, request.url), {
        matched: true,
      });
    }
  } catch {
    /* fall through */
  }
  return cachedRedirect(
    new URL(`/search?q=${encodeURIComponent(`${artist} ${title}`)}`, request.url),
    { matched: false },
  );
}

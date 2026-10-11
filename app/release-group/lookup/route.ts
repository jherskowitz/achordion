import {
  searchReleaseGroups,
  withLookupDeadline,
} from "@/lib/clients/musicbrainz";
import { cachedRedirect, uncachedRedirect } from "@/lib/lookup-redirect";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Resolve `?artist=…&title=…` to a MusicBrainz release-group MBID and
 * redirect to /release-group/<mbid>. Used by chart cards (and other
 * places where we have human names but no MBID) so the lookup happens
 * once on click rather than 50 times at chart-render time, which used
 * to lock the Apple Music charts page for ~50 seconds.
 *
 * Falls back to /search?q=… when nothing matches, so the user always
 * lands somewhere useful.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const artist = url.searchParams.get("artist")?.trim() ?? "";
  const title = url.searchParams.get("title")?.trim() ?? "";
  // Over per-IP budget (a crawler following every lookup link) → skip the
  // MB search and send them to /search. Fail-open on any Upstash error.
  const limit = await checkRateLimit("lookup", request);
  if (!limit.ok) {
    const q = `${artist} ${title}`.trim();
    return uncachedRedirect(
      new URL(q ? `/search?q=${encodeURIComponent(q)}` : "/search", request.url),
    );
  }
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
    const q = `release:"${title.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
    const results = await withLookupDeadline(searchReleaseGroups(q, 8));
    const album = results.find((r) => r["primary-type"] === "Album");
    const ep = results.find((r) => r["primary-type"] === "EP");
    const top = album ?? ep ?? results[0];
    if (top) {
      return cachedRedirect(new URL(`/release-group/${top.id}`, request.url), {
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

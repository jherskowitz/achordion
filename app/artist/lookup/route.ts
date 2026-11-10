import { resolveArtistMbidByName } from "@/lib/clients/musicbrainz";
import { cachedRedirect, uncachedRedirect } from "@/lib/lookup-redirect";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Resolve `?name=…` to a MusicBrainz artist MBID and redirect to
 * /artist/<mbid>. Used by chart grids (and other surfaces where we
 * have a name but no MBID) so the lookup happens once on click rather
 * than 50× at render-time.
 *
 * Falls back to /search?q=… when nothing matches, so the user always
 * lands somewhere useful instead of a 404.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  // Over per-IP budget (a crawler following every lookup link) → skip the
  // MB search and send them to /search. Fail-open on any Upstash error.
  const limit = await checkRateLimit("lookup", request);
  if (!limit.ok) {
    return uncachedRedirect(
      new URL(name ? `/search?q=${encodeURIComponent(name)}` : "/search", request.url),
    );
  }
  if (!name) {
    // Empty/missing name shouldn't 400 — Next's RSC prefetcher hits
    // these URLs eagerly when a Link is rendered, and any chart row
    // with a missing artist credit becomes a 400 in our logs that
    // nobody can act on. Send the user to /search instead, which is
    // what they'd want as a fallback anyway.
    return cachedRedirect(new URL("/search", request.url), { matched: false });
  }
  const id = await resolveArtistMbidByName(name);
  if (id) {
    return cachedRedirect(new URL(`/artist/${id}`, request.url), {
      matched: true,
    });
  }
  return cachedRedirect(
    new URL(`/search?q=${encodeURIComponent(name)}`, request.url),
    { matched: false },
  );
}

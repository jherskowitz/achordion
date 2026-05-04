import { searchArtists } from "@/lib/clients/musicbrainz";

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
  if (!name) {
    // Empty/missing name shouldn't 400 — Next's RSC prefetcher hits
    // these URLs eagerly when a Link is rendered, and any chart row
    // with a missing artist credit becomes a 400 in our logs that
    // nobody can act on. Send the user to /search instead, which is
    // what they'd want as a fallback anyway.
    return Response.redirect(new URL("/search", request.url), 302);
  }
  try {
    // Quote the artist name to bias MB's search toward exact-phrase
    // matches (otherwise common-word names fan out to a long list of
    // unrelated artists ranked higher by token overlap).
    const q = `artist:"${name.replace(/"/g, '\\"')}"`;
    const results = await searchArtists(q, 5);
    const top = results[0];
    if (top?.id) {
      return Response.redirect(
        new URL(`/artist/${top.id}`, request.url),
        302,
      );
    }
  } catch {
    /* fall through */
  }
  return Response.redirect(
    new URL(`/search?q=${encodeURIComponent(name)}`, request.url),
    302,
  );
}

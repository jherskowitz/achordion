import { searchReleaseGroups } from "@/lib/clients/musicbrainz";

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
  if (!artist || !title) {
    return new Response("Missing artist or title", { status: 400 });
  }
  try {
    const q = `release:"${title.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
    const results = await searchReleaseGroups(q, 8);
    const album = results.find((r) => r["primary-type"] === "Album");
    const ep = results.find((r) => r["primary-type"] === "EP");
    const top = album ?? ep ?? results[0];
    if (top) {
      return Response.redirect(
        new URL(`/release-group/${top.id}`, request.url),
        302,
      );
    }
  } catch {
    /* fall through */
  }
  return Response.redirect(
    new URL(`/search?q=${encodeURIComponent(`${artist} ${title}`)}`, request.url),
    302,
  );
}

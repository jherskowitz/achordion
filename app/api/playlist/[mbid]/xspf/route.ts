import { getPlaylist } from "@/lib/clients/listenbrainz";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { playlistToXspf } from "@/lib/xspf";

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mbid: string }> },
) {
  const { mbid } = await params;
  if (!MBID.test(mbid)) {
    return new Response("Invalid playlist MBID", { status: 400 });
  }

  // Cached unauthed lookup first; fall back to the viewer's authed
  // call so the owner can download their own private playlists.
  let playlist = await getPlaylist(mbid);
  let viaAuth = false;
  if (!playlist) {
    const token = await getLbTokenForRequest();
    if (token) {
      playlist = await getPlaylist(mbid, token).catch(() => null);
      if (playlist) viaAuth = true;
    }
  }
  if (!playlist) {
    return new Response("Playlist not found", { status: 404 });
  }

  const identifier = `https://listenbrainz.org/playlist/${mbid}`;
  const xml = playlistToXspf(playlist, identifier);
  const safeName = (playlist.title || mbid)
    .replace(/[^\w\d\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || mbid;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xspf+xml; charset=utf-8",
      "content-disposition": `inline; filename="${safeName}.xspf"`,
      // Authed responses may include a private playlist — never let a
      // shared cache hold onto those.
      "cache-control": viaAuth
        ? "private, no-store"
        : "public, max-age=300",
    },
  });
}

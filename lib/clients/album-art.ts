import "server-only";
import { getItunesAlbumArtwork, getItunesTrackArtwork } from "./itunes";
import { getDeezerAlbumArtwork, getDeezerTrackArtwork } from "./deezer";

/**
 * Resolve album cover art from streaming catalogs, most-reliable
 * first: Apple/iTunes → Deezer. Both are independent of Cover Art
 * Archive, whose archive.org storage nodes flake on brand-new releases
 * (the reason Critical Darlings covers were dropping to placeholders).
 *
 * Two catalogs because neither is complete: iTunes Search misses some
 * indie / small-label / very-fresh titles (its search index lags the
 * store), and Deezer catches many of those. Deezer is only queried
 * when iTunes returns nothing, so the common path is a single call.
 *
 * Returns a ~500px URL or null. On null the caller falls through to the
 * normal track-cover → CAA path.
 */
export async function getAlbumArtwork(
  artist: string,
  album: string,
): Promise<string | null> {
  return (
    (await getItunesAlbumArtwork(artist, album)) ??
    (await getDeezerAlbumArtwork(artist, album))
  );
}

/**
 * Track cover art (the matched track's album cover), same iTunes →
 * Deezer chain as `getAlbumArtwork`. For track-oriented surfaces that
 * have a track title rather than an album name.
 */
export async function getTrackArtwork(
  artist: string,
  track: string,
): Promise<string | null> {
  return (
    (await getItunesTrackArtwork(artist, track)) ??
    (await getDeezerTrackArtwork(artist, track))
  );
}

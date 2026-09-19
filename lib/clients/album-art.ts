import "server-only";
import { getItunesAlbumArtwork } from "./itunes";
import { getDeezerAlbumArtwork } from "./deezer";

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

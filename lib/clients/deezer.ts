import { z } from "zod";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

/**
 * Deezer's free, no-auth lookup of a track by ISRC
 * (`api.deezer.com/track/isrc:<isrc>`).
 *
 * Why we need it: most recordings carry an ISRC but have NO
 * MusicBrainz streaming url-rel, so the track-links resolver has
 * nothing to seed Odesli with and the favicon row comes up empty even
 * though the song is plainly on streaming. Deezer's ISRC endpoint
 * turns the ISRC into a concrete streaming URL for free — which both
 * renders as a Deezer link AND seeds Odesli for the full cross-service
 * set.
 *
 * Response is `{ id, title, link, … }` on a hit, `{ error: {…} }` on a
 * miss. Returns null on miss / not-found / Deezer unreachable, so
 * callers treat it as "no seed from here". Cached 24h per ISRC.
 */
const DeezerIsrcSchema = z.object({
  link: z.string().url().optional(),
  error: z.unknown().optional(),
});

export async function lookupDeezerUrlByIsrc(
  isrc: string,
): Promise<string | null> {
  if (!isrc) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
      {
        headers: { Accept: "application/json" },
        next: {
          revalidate: 60 * 60 * 24,
          tags: [`deezer:isrc:${isrc.toUpperCase()}`],
        },
      },
      6000,
    );
    if (!res.ok) return null;
    const parsed = DeezerIsrcSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.error || !parsed.data.link) return null;
    return parsed.data.link;
  } catch {
    return null;
  }
}

/**
 * Album artwork from Deezer's public search API — the SECONDARY
 * catalog cover source, tried when Apple/iTunes Search has no match
 * (see lib/clients/album-art.ts).
 *
 * Deezer's catalog and search index differ from Apple's — it reliably
 * carries indie / smaller-label releases that iTunes Search either
 * hasn't indexed yet or doesn't stock. Confirmed against titles that
 * return nothing on iTunes Search but are plainly on streaming: The
 * Afghan Whigs' "Soft Control" (on the Apple *store* — but its iTunes
 * Search index lags — and on Deezer), Squirrel Flower's "Say a Prayer
 * to the Gods of Getting Going". Independent of Cover Art Archive.
 *
 * No auth. The `artist:"…" album:"…"` field query is precise — it
 * avoids the wrong-artist matches a bare album-title search produces.
 * Returns a 500px cover URL or null; fail-soft.
 */
export async function getDeezerAlbumArtwork(
  artist: string,
  album: string,
): Promise<string | null> {
  if (!artist.trim() || !album.trim()) return null;
  // Drop embedded quotes so they can't break out of the field query.
  const esc = (s: string) => s.replace(/"/g, " ");
  try {
    const params = new URLSearchParams({
      q: `artist:"${esc(artist)}" album:"${esc(album)}"`,
      limit: "1",
    });
    const res = await fetchWithTimeout(
      `https://api.deezer.com/search/album?${params.toString()}`,
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { cover_big?: string; cover_medium?: string }[];
    };
    const hit = data.data?.[0];
    return hit?.cover_big ?? hit?.cover_medium ?? null;
  } catch {
    return null;
  }
}

/**
 * Track cover artwork from Deezer's track search — the matched track's
 * album cover. Secondary catalog source for track-oriented covers when
 * iTunes Search misses. Keyless, fail-soft.
 */
export async function getDeezerTrackArtwork(
  artist: string,
  track: string,
): Promise<string | null> {
  if (!artist.trim() || !track.trim()) return null;
  const esc = (s: string) => s.replace(/"/g, " ");
  try {
    const params = new URLSearchParams({
      q: `artist:"${esc(artist)}" track:"${esc(track)}"`,
      limit: "1",
    });
    const res = await fetchWithTimeout(
      `https://api.deezer.com/search?${params.toString()}`,
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { album?: { cover_big?: string; cover_medium?: string } }[];
    };
    const album = data.data?.[0]?.album;
    return album?.cover_big ?? album?.cover_medium ?? null;
  } catch {
    return null;
  }
}

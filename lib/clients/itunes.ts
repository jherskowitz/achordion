import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

/**
 * Album artwork from Apple's iTunes Search API — an independent,
 * reliable cover source we use as the PRIMARY art for Critical
 * Darlings.
 *
 * Why not just Cover Art Archive: Critical Darlings is entirely
 * brand-new releases, and CAA (volunteer-uploaded, served off
 * individually-flaky archive.org storage nodes — see the render-
 * resilience notes in AGENTS.md) frequently lacks art for a fresh
 * release or fails to serve it. Apple has store artwork the day an
 * album releases and serves it off a rock-solid CDN. Resolving here
 * server-side and handing it to `<LazyAlbumCover initialSrc={…}>`
 * sidesteps the CAA path entirely for this surface.
 *
 * No auth; ~20 req/min per IP. Returns a 500px artwork URL (matching
 * the `<Image width={500}>` the lazy cover renders) or null. Fail-soft:
 * any error → null, and the caller falls through to the normal
 * track-cover → CAA path.
 */
export async function getItunesAlbumArtwork(
  artist: string,
  album: string,
): Promise<string | null> {
  const term = `${artist} ${album}`.trim();
  if (!term) return null;
  try {
    const params = new URLSearchParams({
      term,
      entity: "album",
      limit: "1",
    });
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?${params.toString()}`,
      // Artwork URLs are effectively immutable once known; a week of
      // data-cache keeps repeat resolves free.
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { artworkUrl100?: string }[];
    };
    const art = data.results?.[0]?.artworkUrl100 ?? null;
    // 100x100 → 500x500 (same upsize trick lib/clients/apple-charts.ts
    // uses on the RSS artwork URLs).
    return art ? art.replace(/100x100/g, "500x500") : null;
  } catch {
    return null;
  }
}

/**
 * Track cover artwork from iTunes Search (the `song` entity) — its
 * album's art. Used for the track-oriented cover surfaces (radio
 * rewinds, recording pages) when Cover Art Archive fails. Same
 * keyless/fail-soft contract as the album variant.
 */
export async function getItunesTrackArtwork(
  artist: string,
  track: string,
): Promise<string | null> {
  const term = `${artist} ${track}`.trim();
  if (!term) return null;
  try {
    const params = new URLSearchParams({
      term,
      entity: "song",
      limit: "1",
    });
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?${params.toString()}`,
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { artworkUrl100?: string }[];
    };
    const art = data.results?.[0]?.artworkUrl100 ?? null;
    return art ? art.replace(/100x100/g, "500x500") : null;
  } catch {
    return null;
  }
}

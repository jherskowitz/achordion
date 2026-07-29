import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import {
  parseMetacriticNewReleases,
  highScoringAlbums,
  type MetacriticAlbum,
} from "@/lib/metacritic-parse";

/**
 * Metacritic album new-releases scraper — the first-party replacement
 * for the vanished FetchRSS feed. No RSS/API exists, but the browse
 * page is server-rendered HTML; `lib/metacritic-parse.ts` extracts the
 * rows. Meant to be driven by a scheduled job (Vercel Cron), which
 * filters to score>80, resolves a Spotify URL, and posts to
 * /api/critical-darlings/ingest.
 */

const NEW_RELEASES_URL =
  "https://www.metacritic.com/browse/albums/release-date/new-releases/date";

// A real browser UA — Metacritic sits behind Cloudflare and a bare
// programmatic UA is more likely to draw a challenge.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/**
 * Fetch + parse the new-releases page. Returns every album row (~100),
 * or [] on any network/parse failure (fail-soft — a scrape outage must
 * not throw into the caller). Cached 6h at the data layer; the Cron
 * cadence is the real refresh driver.
 */
export async function fetchMetacriticNewReleases(): Promise<MetacriticAlbum[]> {
  try {
    const res = await fetchWithTimeout(NEW_RELEASES_URL, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return [];
    return parseMetacriticNewReleases(await res.text());
  } catch {
    return [];
  }
}

/** New releases scoring above `min` (default 80) — the Critical Darlings cut. */
export async function fetchCriticalDarlingCandidates(
  min = 80,
): Promise<MetacriticAlbum[]> {
  return highScoringAlbums(await fetchMetacriticNewReleases(), min);
}

export type { MetacriticAlbum };

import "server-only";

const SONGS_BASE = "https://rss.marketingtools.apple.com/api/v2";
const ALBUMS_BASE = "https://rss.applemarketingtools.com/api/v2";

const USER_AGENT =
  "Achordion/0.1 (+https://github.com/jherskowitz/achordion)";

export interface AppleChartItem {
  /** Stable id from Apple's feed (e.g. song/album track id). */
  id: string;
  rank: number;
  /** Song title or album title. */
  name: string;
  artistName: string;
  /** 600x600 artwork URL. The feed gives us 100x100; we substitute the
   *  string client-side per Apple's documented size convention. */
  artworkUrl: string | null;
  genres: string[];
  url: string | null;
  releaseDate: string | null;
}

interface AppleFeedResult {
  id?: string;
  name?: string;
  artistName?: string;
  artworkUrl100?: string;
  genres?: { name?: string }[];
  url?: string;
  releaseDate?: string;
}

interface AppleFeedResponse {
  feed?: {
    title?: string;
    country?: string;
    updated?: string;
    results?: AppleFeedResult[];
  };
}

function parseResults(
  json: unknown,
  countryCode: string,
): AppleChartItem[] {
  const data = json as AppleFeedResponse;
  const results = data?.feed?.results ?? [];
  return results.map((item, i) => {
    const art = item.artworkUrl100 ?? null;
    return {
      id: item.id ?? `${countryCode}-${i}`,
      rank: i + 1,
      name: item.name ?? "",
      artistName: item.artistName ?? "Unknown artist",
      // Apple serves 100x100 by URL convention; replace to get 600x600.
      // The path segment is exactly "100x100" twice in some URLs (size
      // and filename), so a global replace is what we want.
      artworkUrl: art ? art.replace(/100x100/g, "600x600") : null,
      genres: (item.genres ?? [])
        .map((g) => g.name)
        .filter((n): n is string => typeof n === "string" && n !== "Music"),
      url: item.url ?? null,
      releaseDate: item.releaseDate ?? null,
    };
  });
}

async function fetchFeed(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      // Charts shift slowly. Daily cache keeps us off Apple's servers
      // for repeat views without hiding daily ranking moves.
      next: { revalidate: 60 * 60 * 6, tags: ["apple-charts"] },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Top 50 songs for a given country from Apple Music's "most-played"
 * RSS feed (it's actually JSON despite the URL).
 */
export async function getAppleSongsChart(
  countryCode = "us",
): Promise<AppleChartItem[] | null> {
  const json = await fetchFeed(
    `${SONGS_BASE}/${encodeURIComponent(countryCode)}/music/most-played/50/songs.json`,
  );
  if (!json) return null;
  return parseResults(json, countryCode);
}

/**
 * Top 50 albums for a given country. Apple uses a different host for
 * albums than songs (rss.applemarketingtools vs rss.marketingtools);
 * both work, mirroring Parachord's exact endpoints.
 */
export async function getAppleAlbumsChart(
  countryCode = "us",
): Promise<AppleChartItem[] | null> {
  const json = await fetchFeed(
    `${ALBUMS_BASE}/${encodeURIComponent(countryCode)}/music/most-played/50/albums.json`,
  );
  if (!json) return null;
  return parseResults(json, countryCode);
}

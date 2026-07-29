/**
 * Parser for Metacritic's album new-releases page
 * (https://www.metacritic.com/browse/albums/release-date/new-releases/date).
 *
 * Pure + dependency-free so it's unit-testable and client-safe; the
 * network fetch lives in the server-only sibling `lib/clients/metacritic.ts`.
 *
 * Background: the Critical Darlings pipeline used to be FetchRSS
 * (scrape Metacritic → RSS) → IFTTT (filter score>80 + AI summary +
 * Spotify lookup → POST to our ingest). FetchRSS's feed disappeared,
 * breaking the chain. Metacritic has no RSS/API, but the browse page is
 * classic server-rendered HTML — every field we need sits in stable
 * markup, so we can scrape it ourselves and drop both third parties.
 *
 * Row markup (as of 2026-07):
 *   <div class="clamp-score-wrap">
 *     <a class="metascore_anchor" href="/music/<slug>/<artist>/critic-reviews">
 *       <div class="metascore_w large release positive">81</div></a></div>
 *   <a href="/music/<slug>/<artist>" class="title"><h3>A*POP</h3></a>
 *   <div class="clamp-details">
 *     <div class="artist"> by Tyla </div><span>July 24, 2026</span></div>
 *   <div class="summary"> Tyla returns with ... </div>
 */

const BASE_URL = "https://www.metacritic.com";

export interface MetacriticAlbum {
  title: string;
  artist: string | null;
  /** Metascore 0–100, or null when Metacritic shows "tbd". */
  score: number | null;
  /** Human release date as printed, e.g. "July 24, 2026". */
  releaseDate: string | null;
  /** Absolute Metacritic critic-reviews URL (what the pick links to). */
  reviewUrl: string | null;
  /** Absolute Metacritic album URL. */
  albumUrl: string | null;
  /** Metacritic's own one-line blurb for the album. */
  summary: string | null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

/** Decode HTML entities, looping to a fixpoint to survive any double-
 *  encoding (mirrors the Critical Darlings decoder). */
function decodeEntities(s: string): string {
  const once = (v: string): string =>
    v
      .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number.parseInt(c, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, c) =>
        String.fromCodePoint(Number.parseInt(c, 16)),
      )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  let out = s;
  for (let i = 0; i < 5; i++) {
    const next = once(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

function clean(s: string): string {
  return decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();
}

/**
 * Parse the new-releases page HTML into album rows. Returns every row
 * on the page (typically ~100); filter by `score` at the call site.
 */
export function parseMetacriticNewReleases(html: string): MetacriticAlbum[] {
  const out: MetacriticAlbum[] = [];
  // Each row begins at a score wrapper; split on it so per-row regexes
  // can't leak across album boundaries.
  const rows = html.split(/(?=<div class="clamp-score-wrap">)/);
  for (const row of rows) {
    const score = /metascore_w[^"]*release[^"]*">\s*(\d{1,3}|tbd)\s*</.exec(row);
    const title = /<a href="(\/music\/[^"]+)" class="title"><h3>([\s\S]*?)<\/h3><\/a>/.exec(
      row,
    );
    if (!score || !title) continue;
    const artist = /class="artist">\s*by\s*([\s\S]*?)\s*<\/div>/.exec(row);
    const date = /<span>([A-Z][a-z]+ \d{1,2}, \d{4})<\/span>/.exec(row);
    const review = /metascore_anchor"\s+href="(\/music\/[^"]+\/critic-reviews)"/.exec(
      row,
    );
    const summary = /class="summary">\s*([\s\S]*?)\s*<\/div>/.exec(row);
    const raw = score[1];
    out.push({
      title: clean(title[2]),
      artist: artist ? clean(artist[1]) : null,
      score: raw === "tbd" ? null : Number.parseInt(raw, 10),
      releaseDate: date ? date[1] : null,
      reviewUrl: review ? BASE_URL + review[1] : null,
      albumUrl: BASE_URL + title[1],
      summary: summary ? clean(summary[1]) : null,
    });
  }
  return out;
}

/** Convenience: the Critical Darlings cut — score strictly above `min`. */
export function highScoringAlbums(
  albums: MetacriticAlbum[],
  min = 80,
): MetacriticAlbum[] {
  return albums.filter((a) => a.score !== null && a.score > min);
}

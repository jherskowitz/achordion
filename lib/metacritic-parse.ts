/**
 * Parser for Metacritic's music new-releases browse page
 * (https://www.metacritic.com/browse/music/all/all/all-time/new/).
 *
 * Pure + dependency-free so it's unit-testable and client-safe; the
 * network fetch lives in the server-only sibling `lib/clients/metacritic.ts`.
 *
 * Background: the Critical Darlings pipeline scrapes Metacritic → our
 * `/api/critical-darlings/metacritic.xml` RSS → IFTTT (score filter + AI
 * summary + Spotify lookup → POST to our ingest). This used to target the
 * `/browse/albums/release-date/new-releases/date` page, but Metacritic
 * redesigned the site (~Oct 2026) and retired that whole URL tree (it now
 * 301s to `/browse/game/`), which silently starved the feed. The albums
 * browse now lives under `/browse/music/…` as a Nuxt app whose product
 * cards are still server-rendered — this parses those.
 *
 * Card markup (as of 2026-11): each release is a single anchor
 *   <a … href="/music/<album>/<artist>/" … target="_self">
 *     …<div … aria-label="Metascore 81 out of 100">…</div>…
 *     <h3>…<span>Surface, Echo &amp; Sound</span></h3>
 *     <div data-testid="product-artists" title="Editors">Editors</div>
 *     <div><span>Oct NaN, 2026</span></div>…
 *   </a>
 * We key on the stable bits — the `/music/<album>/<artist>/` href, the
 * `aria-label="Metascore N out of 100"`, the `<h3>` title, and the
 * `data-testid="product-artists"` — rather than the volatile Tailwind
 * class soup. Metacritic's SSR renders the day as literal "NaN" (it's
 * hydrated client-side), so only month + year are reliably recoverable.
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
  // Each product card is one anchor to /music/<album>/<artist>/. Split on
  // every /music anchor and keep the blocks that actually hold a card —
  // identified by the stable `data-testid="product-artists"` + Metascore
  // aria-label — which drops nav / cross-link /music anchors elsewhere on
  // the page. (Card titles/artists are <div>s, not links, so a card block
  // never contains an inner /music anchor that could truncate it.)
  const anchor = /<a\b[^>]*\bhref="\/music\/[^"]+"/g;
  const starts: number[] = [];
  for (let m = anchor.exec(html); m; m = anchor.exec(html)) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(
      starts[i],
      i + 1 < starts.length ? starts[i + 1] : html.length,
    );
    if (
      !block.includes('data-testid="product-artists"') ||
      !block.includes('aria-label="Metascore')
    )
      continue;
    const href = /href="(\/music\/[^"]+)"/.exec(block);
    const title = /<h3[^>]*>(?:\s*<!---->)?\s*<span>([\s\S]*?)<\/span>/.exec(block);
    if (!href || !title) continue;
    const score = /aria-label="Metascore (\d{1,3}|tbd) out of 100"/.exec(block);
    const artist = /data-testid="product-artists"[^>]*\stitle="([^"]*)"/.exec(block);
    const date = /<span>([A-Z][a-z]{2,8}) (\d{1,2}|NaN), (\d{4})<\/span>/.exec(block);
    const raw = score?.[1];
    // Metacritic's SSR renders the day as "NaN" (hydrated client-side), so
    // keep the real day when present but fall back to month + year.
    let releaseDate: string | null = null;
    if (date) {
      const [, mon, day, year] = date;
      releaseDate = day === "NaN" ? `${mon} ${year}` : `${mon} ${day}, ${year}`;
    }
    out.push({
      title: clean(title[1]),
      artist: artist ? clean(artist[1]) : null,
      score: !raw || raw === "tbd" ? null : Number.parseInt(raw, 10),
      releaseDate,
      // Link to the album page (it shows the Metascore + critic reviews);
      // the new site has no reliably-constructible review-tab URL.
      reviewUrl: null,
      albumUrl: BASE_URL + href[1],
      // The source feed carries only the score — IFTTT generates the
      // summaries downstream, so Metacritic's own blurb is never used.
      summary: null,
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

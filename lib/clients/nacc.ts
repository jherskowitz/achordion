/**
 * NACC 200 weekly album chart client.
 *
 * NACC (North American College & Community Radio Chart) is the
 * post-CMJ college-radio chart of record in the US. The full Top 200
 * lives behind a paid subscription; the public chart page exposes
 * the top 30 rows as a teaser. We scrape just that public slice.
 *
 * Why scrape HTML rather than consume a feed: NACC publishes no RSS,
 * JSON, or API for the chart itself. The Spotify playlist they
 * curate (`open.spotify.com/playlist/2jPypS0iBRgL3PHPLqhk65`) is the
 * other consumable — using it would give us ISRCs but loses chart
 * metadata (rank, last-week, label). For now the HTML scrape is the
 * source of truth; we can layer the Spotify route on later for
 * MBID enrichment if needed.
 *
 * The chart table is stable WordPress/TablePress markup — a single
 * `<table class="tablepress …">` with five `<td class="column-N">`
 * cells per row in fixed order: TW · LW · ARTIST · RECORD · LABEL.
 *
 * Caching: chart updates Tuesdays (week-ending Monday). 24h
 * revalidate is plenty.
 *
 * Citizenship: identifying User-Agent + email contact. NACC is one
 * person; if they ever object we'll hear from `support@naccchart.com`
 * before we get blocked.
 */

import type { EarshotChartItem } from "./earshot";

const NACC_URL = "https://naccchart.com/charts/";
const UA = "achordion/1.0 (https://achordion.com)";

export interface NaccTopChart {
  /** Date string as printed on the page, e.g. "WEEK ENDING APRIL 28". */
  weekEnding: string | null;
  /** Top 30 rows shaped to match EarshotChartItem so the existing
   *  CollegeChartsAlbumsGrid can render either chart. NACC has no
   *  cover-art on the page, so coverArtUrl / findImageId are null —
   *  the grid falls through to its neutral placeholder tile. */
  items: EarshotChartItem[];
}

function clean(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the public top 30 of the NACC 200 plus the week-ending date. */
export async function getNaccTop30(): Promise<NaccTopChart | null> {
  try {
    const res = await fetch(NACC_URL, {
      headers: { "User-Agent": UA },
      next: { revalidate: 60 * 60 * 24, tags: ["nacc-top30"] },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseNaccChart(html);
  } catch {
    return null;
  }
}

/**
 * Pull the chart table + week-ending heading out of the NACC HTML.
 * Exported so we can unit-test against fixtures without a live fetch.
 */
export function parseNaccChart(html: string): NaccTopChart {
  // Date heading — sits inside the page hero as `<h1 …><strong>WEEK
  // ENDING APRIL 28</strong></h1>`. The year is not printed; callers
  // can append `new Date().getFullYear()` if they need to disambiguate.
  const dateMatch = html.match(
    /<h1[^>]*>\s*<strong>\s*(WEEK\s+ENDING\s+[^<]+?)\s*<\/strong>\s*<\/h1>/i,
  );
  const weekEnding = dateMatch ? clean(dateMatch[1]) : null;

  // Chart table — the page contains exactly one tablepress block on
  // the public chart route, so a plain class match is enough.
  const tableMatch = html.match(
    /<table[^>]*class="[^"]*tablepress[^"]*"[^>]*>([\s\S]+?)<\/table>/i,
  );
  if (!tableMatch) return { weekEnding, items: [] };
  const table = tableMatch[1];

  const items: EarshotChartItem[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]+?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(table)) !== null) {
    const row = m[1];
    // Skip header rows (they use <th>); only data rows have <td>.
    if (!/<td\b/i.test(row)) continue;
    const cells = [
      ...row.matchAll(/<td[^>]*class="column-(\d)"[^>]*>([\s\S]*?)<\/td>/gi),
    ].map((c) => ({ col: parseInt(c[1], 10), text: clean(c[2]) }));
    if (cells.length < 5) continue;

    // Cells come in the order they're declared in the HTML; map by
    // explicit column number rather than positional index so a future
    // tablepress reorder doesn't silently corrupt the data.
    const byCol = new Map(cells.map((c) => [c.col, c.text]));
    const tw = parseInt(byCol.get(1) ?? "", 10);
    if (!Number.isFinite(tw) || tw <= 0) continue;
    const lwRaw = byCol.get(2) ?? "";
    const lw = parseInt(lwRaw, 10);
    const artist = byCol.get(3) ?? "";
    const album = byCol.get(4) ?? "";
    const label = byCol.get(5) ?? "";
    if (!artist || !album) continue;

    items.push({
      rank: tw,
      lastWeekRank: Number.isFinite(lw) ? lw : null,
      artist,
      album,
      label,
      findImageId: null,
      coverArtUrl: null,
    });
  }
  return { weekEnding, items };
}

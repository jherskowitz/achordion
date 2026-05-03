/**
 * !earshot weekly Top 50 client.
 *
 * Earshot is Canada's NCRA (National Campus and Community Radio
 * Association) — they aggregate chart data from ~50 campus/community
 * stations. The weekly Top 50 is the closest analogue to NACC (US,
 * formerly CMJ).
 *
 * Why we scrape HTML instead of consuming `NewTop50Feed.cfm` (RSS):
 * the public RSS feed only includes the #1 entry of each chart kind
 * — every <item> body is just "#1 ARTIST - Title - Get the full Top
 * 50 at www.earshot-online.com." So we have to hit the chart page
 * itself and parse the HTML table.
 *
 * The table HTML is stable ColdFusion-generated markup (rank cell,
 * artist `<b>`, title `<i>`, label cell, plus a `data-findimage` disc
 * ID we use to fetch cover art via a second endpoint).
 *
 * Caching: chart updates weekly. We use Next's fetch cache with a
 * 24-hour revalidate so we don't pound their server.
 */

const EARSHOT_ORIGIN = "https://www.earshot-online.com";
const EARSHOT_TOP50_URL = `${EARSHOT_ORIGIN}/charts/index.cfm?intChartTypeID=101`;

/**
 * Cover-art lookup endpoint. The disc ID from `data-findimage` is
 * passed under this obfuscated parameter name; the response is a
 * small HTML fragment containing the actual image path under
 * `/reviews/Images/`. The parameter name is hardcoded in the chart
 * page's inline jQuery and stable across requests.
 */
const EARSHOT_IMAGE_LOOKUP_BASE = `${EARSHOT_ORIGIN}/Test/dialog/getimageLink.cfm`;
const EARSHOT_IMAGE_PARAM =
  "vFE5E135FB50A5E1CD140DFCB89DCF666B5382EF6AD49293D9C7E091B72D4707803B660AD981B50AE3A9CDD8D7A36A771";

const UA = "achordion/1.0 (https://achordion.com)";

export interface EarshotChartItem {
  rank: number;
  lastWeekRank: number | null;
  artist: string;
  album: string;
  label: string;
  /** Earshot's internal disc ID, used to resolve cover art. */
  findImageId: string | null;
  /** Absolute cover-art URL once resolved; null if Earshot has none. */
  coverArtUrl: string | null;
}

/** Strip HTML tags and decode common entities to plain text. */
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

/**
 * Pull the Top 50 from earshot-online.com, including resolved cover-
 * art URLs. Returns null on any fetch / parse failure so callers can
 * render a graceful empty state instead of crashing the page.
 *
 * Cover-art resolution adds N follow-up fetches per chart fetch, but
 * each is independently cached by Next (per-URL cache key with 24h
 * revalidate), so warm pages cost zero outbound requests.
 */
export async function getEarshotTop50(): Promise<EarshotChartItem[] | null> {
  try {
    const res = await fetch(EARSHOT_TOP50_URL, {
      headers: { "User-Agent": UA },
      next: { revalidate: 60 * 60 * 24, tags: ["earshot-top50"] },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const items = parseTop50(html);

    // Resolve cover art in parallel with a small concurrency window
    // — 50 simultaneous requests to the same ColdFusion server is
    // rude and we got rate-limited mid-batch in testing; 6 at a time
    // is comfortable and finishes in ~2s on a cold cache.
    const resolved = await mapConcurrent(items, 6, async (it) => {
      if (!it.findImageId) return it;
      const url = await resolveCoverUrl(it.findImageId);
      return { ...it, coverArtUrl: url };
    });
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Parse the chart table out of an Earshot index.cfm HTML page. The
 * structure is: `<table class="chartTable">` containing a header row
 * (`<tr class="theader">`) and 50 data rows. Each data row's cell
 * order is: TW rank · LW rank · Artist (`<b>`) · Title (`<i>`) ·
 * Label · misc. The title cell also embeds a
 * `data-findimage="<disc-id>"` attribute we use to look up cover art.
 */
export function parseTop50(html: string): EarshotChartItem[] {
  const tableMatch = html.match(/<table class="chartTable">([\s\S]+?)<\/table>/);
  if (!tableMatch) return [];
  const table = tableMatch[1];

  const rowRegex = /<tr[^>]*>([\s\S]+?)<\/tr>/g;
  const items: EarshotChartItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(table)) !== null) {
    const row = m[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]+?)<\/td>/g)].map(
      (c) => c[1],
    );
    if (cells.length < 5) continue;

    const rank = parseInt(clean(cells[0]), 10);
    if (!Number.isFinite(rank) || rank <= 0) continue;

    const lastWeekRank = parseInt(clean(cells[1]), 10);
    const artist = clean(cells[2]);
    const album = clean(cells[3]);
    const label = clean(cells[4]);
    if (!artist || !album) continue;

    // Disc ID lives on the title cell as `data-findimage="…"` — the
    // Earshot chart page uses it to AJAX-load a cover-art dialog.
    const idMatch = cells[3].match(/data-findimage="([A-F0-9]+)"/i);
    const findImageId = idMatch ? idMatch[1] : null;

    items.push({
      rank,
      lastWeekRank: Number.isFinite(lastWeekRank) ? lastWeekRank : null,
      artist,
      album,
      label,
      findImageId,
      coverArtUrl: null,
    });
  }
  return items;
}

/**
 * Resolve a disc ID to its absolute cover-art URL by hitting the
 * cover-art dialog endpoint and parsing the returned `<img src=…>`
 * fragment. Returns null when the disc has no image on file.
 */
async function resolveCoverUrl(findImageId: string): Promise<string | null> {
  const url = `${EARSHOT_IMAGE_LOOKUP_BASE}?${EARSHOT_IMAGE_PARAM}=${encodeURIComponent(findImageId)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      // Each disc ID is its own cache key; cover URLs basically
      // never change so 7d revalidate is fine. Tag separately so a
      // selective bust is possible.
      next: { revalidate: 60 * 60 * 24 * 7, tags: ["earshot-cover"] },
    });
    if (!res.ok) return null;
    const fragment = await res.text();
    const m = fragment.match(/<img[^>]+src="([^"]+)"/i);
    if (!m) return null;
    const path = m[1];
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${EARSHOT_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
  } catch {
    return null;
  }
}

/**
 * Map an array through an async fn with bounded concurrency. Order
 * is preserved. Plain-Promise implementation — `p-limit` would be
 * overkill for one call site.
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

import { fetchMetacriticNewReleases } from "@/lib/clients/metacritic";
import { highScoringAlbums } from "@/lib/metacritic-parse";
import { criticsPickId } from "@/lib/clients/critical-darlings";
import { getStoredCriticalDarlings } from "@/lib/critical-darlings-store";

/**
 * Metacritic new-album-releases RSS feed — the drop-in replacement for
 * the vanished FetchRSS feed that fed the Critical Darlings IFTTT applet.
 *
 * This is a SOURCE feed, distinct from `/api/critical-darlings/feed.xml`
 * (which is our OUTPUT — the finished picks Parachord consumes). IFTTT
 * polls this URL, applies its own score filter + AI summary + Spotify
 * lookup, and POSTs each pick to `/api/critical-darlings/ingest` exactly
 * as before — only the source URL changes.
 *
 * Item shape (map IFTTT ingredients to these):
 *   - <title>       "Album by Artist"        → EntryTitle
 *   - <link>        Metacritic critic-reviews URL → EntryUrl
 *   - <description> "Metascore: N. <blurb>"  → EntryContent (score is here
 *                   so IFTTT's filter can read it; the Metacritic blurb
 *                   grounds the AI-summary step)
 *   - <dc:creator>  artist                   → EntryAuthor
 *   - <category>    "metascore:N"            (extra, for score-based filters)
 *   - <pubDate>     RFC-822 feed-availability time (see the note by the item
 *                   build — NOT Metacritic's release date, which the
 *                   redesign no longer exposes a usable day for)
 *   - <guid>        Metacritic album URL (stable)
 *
 * By default every parsed release is included (~100 items) and IFTTT does
 * the score filtering, matching the old FetchRSS behavior. Pass `?min=80`
 * to have the feed pre-filter to Metascore > 80 (then IFTTT's own filter
 * becomes a redundant no-op you can remove).
 *
 * The scrape itself is data-cached 6h (see lib/clients/metacritic.ts), so
 * IFTTT's polling can't hammer Metacritic; this response is CDN-cached too.
 */

const CHANNEL_LINK =
  "https://www.metacritic.com/browse/music/all/all/all-time/new/";

/** Wrap arbitrary text in a CDATA section, neutralizing any embedded `]]>`. */
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** Escape a value used in element text / attribute (link, guid). */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const minRaw = url.searchParams.get("min");
  const min =
    minRaw !== null && Number.isFinite(Number.parseInt(minRaw, 10))
      ? Number.parseInt(minRaw, 10)
      : null;

  const all = await fetchMetacriticNewReleases();
  const scored = min !== null ? highScoringAlbums(all, min) : all;

  // Only publish the MISSING high-scorers — albums that meet the cut but
  // aren't already in our Critical Darlings store. Metacritic's new-releases
  // page always lists the current ~50, so without this the feed resuming
  // after a gap (or any re-scrape) would re-present every current high-scorer
  // to IFTTT, which would re-run its AI-summary + Spotify steps and re-ingest
  // picks we already have (bumping their order to "newest"). The store id is
  // deterministic on (title, artist) via the same `criticsPickId` the ingest
  // route uses, so we can predict it and filter here. Fail-open on a store
  // read error — IFTTT's per-GUID dedup + the ingest upsert still prevent
  // duplicate rows; this just spares the wasteful re-processing upstream.
  const publishedIds = new Set(
    (await getStoredCriticalDarlings().catch(() => [])).map((p) => p.id),
  );
  const albums = scored.filter(
    (a) => !a.artist || !publishedIds.has(criticsPickId(a.title, a.artist)),
  );

  // pubDate carries RECENCY for IFTTT's RSS trigger, which fires only for
  // items that look new *and recent* (it compares pubDate against its last
  // check). Metacritic's redesign renders the release day as "NaN", so we
  // only recover month+year — and a month-only date reads as weeks old, so
  // the trigger skipped our catch-up items as "not recent". But every item
  // here IS newly available in our feed (the only-missing filter guarantees
  // it isn't in our store yet), so we stamp it with the feed-generation time,
  // newest first. Stable within the 30-min edge-cache window, and the GUID
  // (album URL) keeps IFTTT from re-firing once an item is ingested — the
  // only-missing filter then drops it from the feed entirely.
  const now = Date.now();
  const items = albums
    .map((a, i) => {
      const title = a.artist ? `${a.title} by ${a.artist}` : a.title;
      const scorePrefix = a.score !== null ? `Metascore: ${a.score}. ` : "";
      const description = `${scorePrefix}${a.summary ?? ""}`.trim();
      const link = a.reviewUrl ?? a.albumUrl ?? CHANNEL_LINK;
      const guid = a.albumUrl ?? link;
      const pubDate = new Date(now - i * 1000).toUTCString();
      return [
        "    <item>",
        `      <title>${cdata(title)}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="false">${xmlEscape(guid)}</guid>`,
        ...(a.artist ? [`      <dc:creator>${cdata(a.artist)}</dc:creator>`] : []),
        ...(a.score !== null
          ? [`      <category>metascore:${a.score}</category>`]
          : []),
        `      <description>${cdata(description)}</description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Metacritic — New Album Releases</title>
    <link>${CHANNEL_LINK}</link>
    <description>New album releases from Metacritic with Metascores — source feed for the Critical Darlings pipeline.</description>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}

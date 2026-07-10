import { getStoredCriticalDarlings } from "@/lib/critical-darlings-store";
import { decodeHtmlEntities } from "@/lib/clients/critical-darlings";

/**
 * RSS 2.0 feed of Critical Darlings picks — the drop-in replacement for
 * the RSSground-hosted feed both Achordion and the Parachord apps used
 * to poll.
 *
 * Byte-compatible with the shape Parachord's `parseCriticsPicksRSS()`
 * (and Achordion's own `parseRss`) already consume, so Parachord repoints
 * from `rssground.com/p/uncoveries` to here with only a URL change — no
 * parser rewrite:
 *   - `<title>` is `"Album by Artist"` (the parser splits on the last
 *     " by ").
 *   - `<description>` carries the AI summary with the Spotify album URL
 *     appended, so the parser's `extractSpotifyUrl` finds it (mirrors
 *     RSSground's `{{Response}} {{AlbumUrl}}` item body).
 *   - `<link>` is the Metacritic review URL; `<guid>` is the stable id.
 *
 * Reads the webhook-fed store only (no rssground fallback — the point is
 * to move off it). Public + CDN-cached; the ingest route revalidates
 * this path so a new pick shows without waiting out s-maxage.
 */

const CHANNEL_LINK = "https://achordion.xyz/explore/critical-darlings";

/** Wrap arbitrary text in a CDATA section, escaping any embedded `]]>`
 *  so the closing sequence can't terminate the section early. */
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

export async function GET(): Promise<Response> {
  const picks = await getStoredCriticalDarlings().catch(() => []);

  const items = picks
    .map((p) => {
      // "Album by Artist" — the exact shape the RSS parsers split.
      const title = `${p.title} by ${p.artist}`;
      // AI summary + Spotify album URL, so the parser's Spotify
      // extraction has the URL to find (RSSground appended it too).
      // Decode on read so store entries written with a residual "&amp;"
      // (double-encoded upstream) ship clean, matching the page.
      const desc = decodeHtmlEntities(p.description);
      const description = p.spotifyUrl ? `${desc} ${p.spotifyUrl}`.trim() : desc;
      const link = p.link || CHANNEL_LINK;
      // RFC-822 pubDate when the stored value parses; otherwise omit.
      const parsed = p.pubDate ? new Date(p.pubDate) : null;
      const pubDate =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed.toUTCString() : null;
      return [
        "    <item>",
        `      <title>${cdata(title)}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="false">${xmlEscape(p.id)}</guid>`,
        `      <description>${cdata(description)}</description>`,
        ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Critical Darlings</title>
    <link>${CHANNEL_LINK}</link>
    <description>Top-rated albums from leading music publications, curated by Achordion.</description>
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

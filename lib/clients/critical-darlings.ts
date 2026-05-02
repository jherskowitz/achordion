import "server-only";

/**
 * Critical Darlings — top-rated albums from leading music publications.
 *
 * Mirrors Parachord's `loadCriticsPicks()` / `parseCriticsPicksRSS()`:
 *  1. Fetch the rssground.com/p/uncoveries feed
 *  2. Parse each item title as "Album Title by Artist Name"
 *  3. Pull a Spotify album URL out of the description if present
 *
 * The desktop and Android clients also lazily resolve cover art via
 * MusicBrainz + CAA after parsing — we do that on the page itself with
 * a per-card Suspense fence so the rate-limited MB calls stream in.
 */

const RSS_URL = "https://www.rssground.com/p/uncoveries";

export interface CriticsPickAlbum {
  /** Stable slug — `${title}|${artist}` lowercased, non-alnum → `-`. */
  id: string;
  title: string;
  artist: string;
  /** Per-item link from the feed (Metacritic critic reviews page). */
  link: string | null;
  description: string;
  /** Spotify album URL extracted from the description, when present. */
  spotifyUrl: string | null;
  pubDate: string | null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cleanHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parse "Album Title\nby Artist Name" — the feed uses literal newlines.
 * Splits on the LAST " by " so things like "Stand By Me by Ben E. King"
 * still parse correctly. Mirrors Parachord exactly.
 */
function parseTitle(raw: string): { title: string; artist: string } | null {
  const normalised = raw.replace(/\s+/g, " ").trim();
  const idx = normalised.lastIndexOf(" by ");
  if (idx <= 0) return null;
  const title = normalised.substring(0, idx).trim();
  const artist = normalised.substring(idx + 4).trim();
  if (!title || !artist) return null;
  return { title, artist };
}

function extractSpotifyUrl(html: string): string | null {
  const m = html.match(/https?:\/\/open\.spotify\.com\/album\/[a-zA-Z0-9]+/);
  return m ? m[0] : null;
}

function slug(title: string, artist: string): string {
  return `${title}|${artist}`.toLowerCase().replace(/[^a-z0-9|]+/g, "-");
}

function parseRss(xml: string): CriticsPickAlbum[] {
  const out: CriticsPickAlbum[] = [];
  const seen = new Set<string>();
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const titleRe = /<title>([\s\S]*?)<\/title>/;
  const linkRe = /<link>([\s\S]*?)<\/link>/;
  const descRe = /<description>([\s\S]*?)<\/description>/;
  const pubRe = /<pubDate>([\s\S]*?)<\/pubDate>/;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const item = m[1];
    const titleRaw = decodeHtmlEntities(
      stripCdata(titleRe.exec(item)?.[1] ?? "").trim(),
    );
    if (!titleRaw) continue;
    const parsed = parseTitle(titleRaw);
    if (!parsed) continue;
    const id = slug(parsed.title, parsed.artist);
    if (seen.has(id)) continue;
    seen.add(id);
    const linkRaw = stripCdata(linkRe.exec(item)?.[1] ?? "").trim();
    const descRaw = stripCdata(descRe.exec(item)?.[1] ?? "").trim();
    const pubDate = stripCdata(pubRe.exec(item)?.[1] ?? "").trim() || null;
    out.push({
      id: `critics-${id}`,
      title: parsed.title,
      artist: parsed.artist,
      link: linkRaw || null,
      description: cleanHtml(descRaw),
      spotifyUrl: extractSpotifyUrl(descRaw),
      pubDate,
    });
  }
  return out;
}

/**
 * Fetch the Critical Darlings RSS feed. Cached for 4 hours (matching
 * Parachord's TTL). Returns [] on any network/parse failure — the
 * caller decides how to render the empty state.
 */
export async function getCriticalDarlings(): Promise<CriticsPickAlbum[]> {
  try {
    const res = await fetch(RSS_URL, {
      headers: {
        "User-Agent": "Achordion/0.1 (jherskow@gmail.com)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      next: { revalidate: 60 * 60 * 4, tags: ["critical-darlings"] },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml);
  } catch {
    return [];
  }
}

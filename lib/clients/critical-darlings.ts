import "server-only";
import { getStoredCriticalDarlings } from "@/lib/critical-darlings-store";

/**
 * Critical Darlings — top-rated albums from leading music publications.
 *
 * Source is the webhook-fed store: IFTTT (Metacritic scrape + score>80
 * filter + AI summary + Spotify lookup) POSTs each new pick to
 * `/api/critical-darlings/ingest`, which upserts into Upstash. This is
 * the same store the Parachord-facing `feed.xml` serves — the legacy
 * rssground.com fallback was removed once every client had migrated off
 * it (see #81 / #83).
 *
 * The desktop and Android clients lazily resolve cover art via
 * MusicBrainz + CAA after parsing — we do that on the page itself with
 * a per-card Suspense fence so the rate-limited MB calls stream in.
 */

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
  /** Metacritic metascore (0–100), when the source provides it. The
   *  legacy RSS feed doesn't carry it; the webhook ingest does. */
  score?: number;
}

function decodeHtmlEntitiesOnce(s: string): string {
  return (
    s
      // Numeric character references — decimal (`&#039;`) and hex (`&#x27;`).
      // These come through the RSS feed for any non-ASCII char and for
      // straight-quoted apostrophes ("I&#039;m People").
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCodePoint(Number.parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      // Named entities, decoded last so &amp; doesn't double-decode
      // within a single pass.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
  );
}

/**
 * Decode HTML entities, repeating until stable. The upstream text is
 * sometimes DOUBLE-encoded — IFTTT's AI-summary ingredient already
 * contains `&amp;` and IFTTT re-escapes it on substitution, yielding
 * `&amp;amp;`. A single pass would leave a literal `&amp;` on screen
 * ("Panda Bear &amp; Sonic Boom", "R&amp;B"). Looping to a fixpoint
 * collapses any depth of over-encoding; the 5-iteration cap guards
 * against a pathological input. Album blurbs never legitimately want a
 * literal `&amp;`, so over-decoding is a non-issue here.
 */
export function decodeHtmlEntities(s: string): string {
  let out = s;
  for (let i = 0; i < 5; i++) {
    const next = decodeHtmlEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
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
 *
 * Exported so the ingest webhook can accept a single combined
 * "Album by Artist" field (what the feed item title carries, and the
 * easiest thing for IFTTT to pass) and split it the same way the feed
 * parser does.
 */
export function parseCriticsPickTitle(
  raw: string,
): { title: string; artist: string } | null {
  const normalised = raw.replace(/\s+/g, " ").trim();
  const idx = normalised.lastIndexOf(" by ");
  if (idx <= 0) return null;
  const title = normalised.substring(0, idx).trim();
  const artist = normalised.substring(idx + 4).trim();
  if (!title || !artist) return null;
  return { title, artist };
}

function slug(title: string, artist: string): string {
  return `${title}|${artist}`.toLowerCase().replace(/[^a-z0-9|]+/g, "-");
}

/**
 * Stable render id for a pick: `critics-<slug>`. The ingest webhook and
 * the store key on this same format, so picks dedupe by it.
 */
export function criticsPickId(title: string, artist: string): string {
  return `critics-${slug(title, artist)}`;
}

/**
 * Sanitize a critic-review blurb / AI summary for display: strip HTML
 * tags + bare URLs, decode entities, collapse whitespace. Exported for
 * the ingest route so webhook summaries get the same treatment the
 * legacy feed descriptions do.
 */
export function sanitizeCriticalDarlingText(html: string): string {
  return cleanHtml(html);
}

/**
 * Read the Critical Darlings picks from the webhook-fed store, newest
 * first. Returns [] on any store failure — the caller decides how to
 * render the empty state.
 *
 * Caching + the `critical-darlings` tag live on the store read
 * (`getStoredCriticalDarlings`, `unstable_cache`), which the ingest
 * route busts on each new pick — so this function needs no cache of its
 * own. The per-card MB/CAA cover lookups happen on the page behind a
 * Suspense fence, not here.
 */
export async function getCriticalDarlings(): Promise<CriticsPickAlbum[]> {
  const stored = await getStoredCriticalDarlings().catch(() => []);

  // The store upserts dedupe on ingest, but keep a defensive pass so a
  // stray duplicate never double-renders.
  const seen = new Set<string>();
  const picks: CriticsPickAlbum[] = [];
  for (const p of stored) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push(p);
  }
  // Newest-first by pubDate; missing/unparseable dates sort last.
  picks.sort(
    (a, b) =>
      (Date.parse(b.pubDate ?? "") || 0) - (Date.parse(a.pubDate ?? "") || 0),
  );
  // Normalize descriptions on read. Store entries written under the old
  // single-pass decoder kept a residual `&amp;`; re-decoding here repairs
  // them without a re-ingest (idempotent for already-clean text).
  return picks.map((p) => ({
    ...p,
    description: decodeHtmlEntities(p.description),
  }));
}

import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { AddSourcesButton } from "./add-sources-button";

/**
 * Curated set of "useful" url-rel types that appear on artist /
 * release-group / recording entries. Used to bias the sort so the
 * recognisable services float to the front before any wiki / archive
 * links.
 */
const PREFERRED_TYPES = new Set([
  "official homepage",
  "wikipedia",
  "wikidata",
  "bandcamp",
  "soundcloud",
  "youtube",
  "social network",
  "discogs",
  "lyrics",
  "free streaming",
  "streaming",
  "purchase for download",
]);

/**
 * Within the streaming favicon row we want a deterministic, opinionated
 * order: Bandcamp first (artist-supportive), then the major DSPs in
 * descending order of how often Achordion's audience uses them, then
 * everything else by MB's natural ordering. Anything matched here goes
 * to the front; unmatched links keep their relative order behind.
 *
 * Hosts are matched as substrings of the lowercased URL — covers both
 * `https://open.spotify.com/…` and `https://spotify.com/…`-style
 * variations without enumerating subdomains.
 */
const STREAMING_HOST_PRIORITY: string[] = [
  "bandcamp.com",
  "spotify.com",
  "music.apple.com",
  "tidal.com",
  "qobuz.com",
  "soundcloud.com",
  "music.youtube.com",
  "youtube.com",
];

function streamingPriority(url: string): number {
  const u = url.toLowerCase();
  for (let i = 0; i < STREAMING_HOST_PRIORITY.length; i++) {
    if (u.includes(STREAMING_HOST_PRIORITY[i])) return i;
  }
  return STREAMING_HOST_PRIORITY.length;
}

/**
 * Hosts that are definitively dead — sites that have shut down /
 * redirect to homepages / are otherwise useless to surface. MB
 * editors leave these on entities for years after the service dies,
 * so we filter at the presentation layer rather than waiting for
 * data cleanup upstream. Substring match on the lowercased URL.
 */
const DEAD_HOST_FRAGMENTS = [
  "plus.google.com", // Google+ — shut down April 2019
  "googleplus.com",
  "rdio.com", // Rdio — shut down December 2015
  "vine.co", // Vine — shut down January 2017
  "grooveshark.com", // Grooveshark — shut down April 2015
  "imeem.com", // imeem — shut down 2009
  "8tracks.com", // 8tracks — shut down January 2019
  "thesixtyone.com", // thesixtyone — shut down 2012
  "exfm.com", // ex.fm — shut down 2013
  "playmusic.com", // Google Play Music — shut down December 2020
  "songkick.com/concerts", // Songkick concerts merged into Bandsintown
  "myspace.com/music", // Myspace Music — effectively dead (data lost in 2019)
];

function isDeadHost(url: string): boolean {
  const u = url.toLowerCase();
  return DEAD_HOST_FRAGMENTS.some((h) => u.includes(h));
}

/**
 * Normalize a streaming URL by stripping the country / locale segment.
 *
 * Used for two purposes:
 *   1. Deduplication — MB editors routinely attach the same Apple
 *      Music / iTunes link in multiple regional variants on a single
 *      entity (`/us/album/…`, `/gb/album/…`, `/jp/album/…`); the
 *      normalized form lets the dedupe step keep just one.
 *   2. Rendered href — Apple Music auto-routes users to their own
 *      storefront when no country segment is present, so stripping
 *      the segment means a US-based MB editor adding a `/us/` URL
 *      doesn't force a UK user into the US store.
 *
 * Applied to:
 *   - `music.apple.com/<cc>/…` and `itunes.apple.com/<cc>/…` →
 *     strip the leading two-letter country segment.
 *   - `open.spotify.com/intl-XX/…` → strip the `/intl-XX/` prefix.
 *
 * Returns the original URL on parse failure.
 */
/**
 * Returns the URL only if it parses AND uses an `http(s):` scheme.
 * `null` for anything else (`javascript:`, `data:`, `file:`, malformed,
 * empty). Use this anywhere a URL from third-party data (MusicBrainz
 * url-rels, ListenBrainz playlists, Wikipedia) becomes an `href`.
 *
 * MB editor input is *mostly* trustworthy but the schema only enforces
 * `z.string()` — without this guard, a malicious `javascript:alert(1)`
 * URL on an MB entity would render as a clickable XSS link in
 * Achordion's UI.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Normalize a streaming-service URL for the user's storefront, then
 * scheme-validate. Returns `null` for any non-`http(s):` URL or parse
 * failure — callers MUST handle null (skip the link entirely).
 */
export function normalizeStreamingUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (host === "music.apple.com" || host === "itunes.apple.com") {
      const seg = u.pathname.split("/").filter(Boolean);
      if (seg.length > 0 && /^[a-z]{2}$/i.test(seg[0])) {
        u.pathname = "/" + seg.slice(1).join("/");
      }
    }
    if (host === "open.spotify.com") {
      u.pathname = u.pathname.replace(/^\/intl-[a-z]{2,5}\//i, "/");
    }
    return u.toString();
  } catch {
    return null;
  }
}

// ─── Categorisation helpers ────────────────────────────────────────
// The artist page splits external links across three locations
// (streaming row under the title, social row in the bio block, leftover
// reference links in the sidebar) — the predicates below make that
// split deterministic without baking layout decisions into the
// presentational ExternalLinks component.

const STREAMING_TYPES = new Set([
  "free streaming",
  "streaming",
  "purchase for download",
  "purchase for mail-order",
  "download for free",
]);

const STREAMING_HOST_FRAGMENTS = [
  "spotify.com",
  "music.apple.com",
  "itunes.apple.com",
  "youtube.com",
  "music.youtube.com",
  "bandcamp.com",
  "soundcloud.com",
  "tidal.com",
  "deezer.com",
  "music.amazon.",
  "qobuz.com",
  "beatport.com",
];

const SOCIAL_TYPES = new Set([
  "social network",
  "official homepage",
  "blog",
]);

const SOCIAL_HOST_FRAGMENTS = [
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "threads.net",
  "bsky.app",
  "reddit.com",
  "mastodon.",
];

function isStreaming(link: ArtistExternalLink): boolean {
  if (STREAMING_TYPES.has(link.type)) return true;
  const u = link.url.toLowerCase();
  return STREAMING_HOST_FRAGMENTS.some((h) => u.includes(h));
}

function isSocial(link: ArtistExternalLink): boolean {
  if (SOCIAL_TYPES.has(link.type)) return true;
  const u = link.url.toLowerCase();
  return SOCIAL_HOST_FRAGMENTS.some((h) => u.includes(h));
}

export interface CategorisedLinks {
  streaming: ArtistExternalLink[];
  social: ArtistExternalLink[];
  other: ArtistExternalLink[];
}

/**
 * Split a flat list of MB url-rels into:
 *   - streaming  → Spotify / Apple Music / YouTube / Bandcamp / etc.
 *   - social     → X / Instagram / Mastodon / "official homepage" / …
 *   - other      → Wikipedia, Wikidata, Discogs, IMDb, lyrics sites, …
 *
 * Streaming wins ties — a `bandcamp.com` URL typed as
 * "official homepage" should still land in the streaming row.
 */
export function categoriseLinks(
  links: ArtistExternalLink[],
): CategorisedLinks {
  const streaming: ArtistExternalLink[] = [];
  const social: ArtistExternalLink[] = [];
  const other: ArtistExternalLink[] = [];
  // Drop dead-host links upfront so they don't reach the sidebar's
  // "Other Links" either — same filter that's applied at render time.
  for (const l of links.filter((x) => !isDeadHost(x.url))) {
    if (isStreaming(l)) streaming.push(l);
    else if (isSocial(l)) social.push(l);
    else other.push(l);
  }
  return { streaming, social, other };
}

/**
 * Fast lookup for tooltip labels keyed by a substring that needs to
 * appear anywhere in the URL. Order matters — longer / more specific
 * fragments come first so e.g. `music.apple.com` matches as
 * "Apple Music" before a future `apple.com` would match as "Apple".
 */
const HOST_LABEL_RULES: [string, string][] = [
  ["music.apple.com", "Apple Music"],
  ["itunes.apple.com", "iTunes"],
  ["music.youtube.com", "YouTube Music"],
  ["music.amazon.", "Amazon Music"],
  ["bandcamp.com", "Bandcamp"],
  ["soundcloud.com", "SoundCloud"],
  ["spotify.com", "Spotify"],
  ["youtube.com", "YouTube"],
  ["tidal.com", "Tidal"],
  ["deezer.com", "Deezer"],
  ["qobuz.com", "Qobuz"],
  ["beatport.com", "Beatport"],
  ["vimeo.com", "Vimeo"],
  ["wikipedia.org", "Wikipedia"],
  ["wikidata.org", "Wikidata"],
  ["musicbrainz.org", "MusicBrainz"],
  ["discogs.com", "Discogs"],
  ["genius.com", "Genius"],
  ["last.fm", "Last.fm"],
  ["lyrics.com", "Lyrics.com"],
  ["musixmatch.com", "Musixmatch"],
  ["azlyrics.com", "AZLyrics"],
  ["instagram.com", "Instagram"],
  ["twitter.com", "X"],
  ["x.com", "X"],
  ["facebook.com", "Facebook"],
  ["tiktok.com", "TikTok"],
  ["threads.net", "Threads"],
  ["bsky.app", "Bluesky"],
  ["reddit.com", "Reddit"],
  ["mastodon.", "Mastodon"],
  ["allmusic.com", "AllMusic"],
  ["rateyourmusic.com", "Rate Your Music"],
  ["setlist.fm", "setlist.fm"],
  ["imdb.com", "IMDb"],
  ["pinterest.", "Pinterest"],
  ["patreon.com", "Patreon"],
];

/**
 * Derive a friendly label from the URL hostname when no known pattern
 * matches. Strips the leading subdomain (`open.`, `www.`, etc.) and
 * picks the second-level domain, capitalised. Used as a fallback so
 * the tooltip shows e.g. "Songkick" for songkick.com instead of the
 * MB rel-type ("purchase for download" / "lyrics" / etc.) which is
 * jarringly category-like.
 */
function siteNameFromHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Drop standard-issue subdomains so `open.spotify.com` →
    // `spotify.com` → `Spotify` (handled by the rule list usually,
    // this covers the long tail).
    const stripped = host.replace(/^(www|m|open|music|web|en)\./, "");
    const root = stripped.split(".")[0];
    if (!root) return null;
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return null;
  }
}

/** Friendly label used in the tooltip — never the raw MB rel type. */
function tooltipLabel(link: ArtistExternalLink): string {
  const u = link.url.toLowerCase();
  for (const [needle, label] of HOST_LABEL_RULES) {
    if (u.includes(needle)) return label;
  }
  if (link.type === "official homepage") return "Official site";
  // Last resort: derive from the hostname so we never show a rel-type
  // string like "Purchase For Download" / "Lyrics" / "Free Streaming".
  return siteNameFromHost(link.url) ?? "External link";
}

/**
 * Build a Google s2 favicons URL for any host. s2 returns a generic
 * globe glyph when the domain doesn't have a favicon, so we don't need
 * an extra fallback path. Empty string for malformed URLs (the `<img>`
 * shows the browser's broken-image glyph then).
 *
 * Special-case: every artist on Bandcamp lives on `<artist>.bandcamp.com`
 * and most don't set a favicon, so the s2 lookup returns a generic
 * globe. Force the canonical `bandcamp.com` icon for any *.bandcamp.com
 * URL so the row stays recognisable.
 */
function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.toLowerCase().endsWith(".bandcamp.com")) {
      return `https://www.google.com/s2/favicons?domain=bandcamp.com&sz=64`;
    }
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

export function ExternalLinks({
  links,
  addSources,
}: {
  links: ArtistExternalLink[];
  /** When provided, append a "+" tile linking to the MB
   *  `edit-relationships` page so users can add more URLs. */
  addSources?: { mbEntity: "artist" | "release-group" | "recording" | "release"; mbid: string };
}) {
  // Dedupe and sort:
  //   1. drop dead-host links (Google+, Rdio, Vine, etc. — see
  //      DEAD_HOST_FRAGMENTS).
  //   2. dedupe by NORMALIZED url so regional Apple Music / Spotify
  //      variants of the same canonical link collapse to one. Keep
  //      the first occurrence's original URL in the value — the
  //      country code in the path is harmless when clicked.
  //   3. sort by streaming-host priority (Bandcamp → Spotify → Apple
  //      Music → Tidal → Qobuz → SoundCloud → YouTube), then by
  //      preferred MB rel-types, then natural ordering.
  const seen = new Map<string, ArtistExternalLink>();
  for (const l of links) {
    if (isDeadHost(l.url)) continue;
    // Drop unsafe-scheme URLs (javascript:, data:, etc.) at the dedup
    // step so they never reach render. `key` doubles as both the
    // dedup key and the safety gate.
    const key = normalizeStreamingUrl(l.url);
    if (key === null) continue;
    if (!seen.has(key)) seen.set(key, l);
  }
  const deduped = Array.from(seen.values());
  const sorted = deduped
    .slice()
    .sort((a, b) => {
      const sp = streamingPriority(a.url) - streamingPriority(b.url);
      if (sp !== 0) return sp;
      const ap = PREFERRED_TYPES.has(a.type) ? 0 : 1;
      const bp = PREFERRED_TYPES.has(b.type) ? 0 : 1;
      return ap - bp;
    })
    .slice(0, 12);

  if (sorted.length === 0 && !addSources) return null;

  return (
    <ul className="flex flex-wrap gap-2" role="list">
      {sorted.map((link) => {
        const label = tooltipLabel(link);
        const src = faviconUrl(link.url);
        // Render the country-stripped URL so Apple Music / iTunes /
        // Spotify auto-route to the user's storefront instead of the
        // one MB's editor happened to use. Already non-null here —
        // unsafe schemes were filtered out in the dedup loop above —
        // but assert to satisfy the type and stay defensive.
        const href = normalizeStreamingUrl(link.url);
        if (href === null) return null;
        return (
          // CSS-only IconTooltip — pure styling sibling, no Radix
          // slot chain, no hydration round-trip. See
          // components/ui/icon-tooltip.tsx for the rationale.
          <li key={link.url}>
            <IconTooltip label={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                suppressHydrationWarning
                className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex size-9 items-center justify-center rounded-md border transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  className="size-4 opacity-80 hover:opacity-100"
                />
              </a>
            </IconTooltip>
          </li>
        );
      })}
      {addSources && (
        <li>
          <AddSourcesButton {...addSources} />
        </li>
      )}
    </ul>
  );
}

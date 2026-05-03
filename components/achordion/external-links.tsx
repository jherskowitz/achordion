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
 *   - social     → Twitter, Instagram, Mastodon, "official homepage", …
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
  for (const l of links) {
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
  ["discogs.com", "Discogs"],
  ["genius.com", "Genius"],
  ["last.fm", "Last.fm"],
  ["lyrics.com", "Lyrics.com"],
  ["musixmatch.com", "Musixmatch"],
  ["azlyrics.com", "AZLyrics"],
  ["instagram.com", "Instagram"],
  ["twitter.com", "Twitter"],
  ["x.com", "Twitter"],
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
 */
function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
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
  // Dedupe by URL and bias preferred service rels to the front.
  const deduped = Array.from(
    new Map(links.map((l) => [l.url, l])).values(),
  );
  const sorted = deduped
    .slice()
    .sort((a, b) => {
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
        return (
          // CSS-only IconTooltip — pure styling sibling, no Radix
          // slot chain, no hydration round-trip. See
          // components/ui/icon-tooltip.tsx for the rationale.
          <li key={link.url}>
            <IconTooltip label={label}>
              <a
                href={link.url}
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

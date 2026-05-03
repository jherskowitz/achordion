import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";

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

/** Friendly label used in the tooltip — falls back to the MB rel type. */
function tooltipLabel(link: ArtistExternalLink): string {
  const u = link.url.toLowerCase();
  if (link.type === "official homepage") return "Official site";
  if (u.includes("wikipedia.org")) return "Wikipedia";
  if (u.includes("wikidata.org")) return "Wikidata";
  if (u.includes("bandcamp.com")) return "Bandcamp";
  if (u.includes("soundcloud.com")) return "SoundCloud";
  if (u.includes("spotify.com")) return "Spotify";
  if (u.includes("music.apple.com")) return "Apple Music";
  if (u.includes("youtube.com")) return "YouTube";
  if (u.includes("discogs.com")) return "Discogs";
  if (u.includes("genius.com")) return "Genius";
  if (u.includes("last.fm")) return "Last.fm";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "Twitter";
  if (u.includes("facebook.com")) return "Facebook";
  if (u.includes("imdb.com")) return "IMDb";
  // Capitalised type name (`free_streaming` → `Free streaming`).
  return link.type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

export function ExternalLinks({ links }: { links: ArtistExternalLink[] }) {
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

  if (sorted.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" role="list">
      {sorted.map((link) => {
        const label = tooltipLabel(link);
        const src = faviconUrl(link.url);
        return (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={label}
              aria-label={label}
              className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 group inline-flex size-9 items-center justify-center rounded-md border transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                className="size-4 opacity-80 transition-opacity group-hover:opacity-100"
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

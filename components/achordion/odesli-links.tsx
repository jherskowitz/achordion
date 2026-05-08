import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";
import { getOdesliLinks } from "@/lib/clients/odesli";
import { resolveTrackLinks } from "@/lib/track-links-resolver";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { AddSourcesButton } from "./add-sources-button";
import { normalizeStreamingUrl, tooltipLabel } from "./external-links";

/**
 * Server component that takes a streaming URL we have for the entity
 * (from MusicBrainz url-rels, usually) and renders a row of service
 * favicons covering Spotify / Apple Music / YouTube / Tidal / Deezer /
 * etc. — courtesy of Odesli's cross-service lookup.
 *
 * Renders nothing when:
 *   - no seed URL was supplied, or
 *   - Odesli returned no usable platforms (rate-limited, obscure
 *     track, deindexed entity, etc.).
 *
 * We deliberately do NOT fall back to song.link/i/<isrc> for
 * ISRC-only tracks: those URLs serve a 200 OK page but render empty
 * for any ISRC Odesli hasn't indexed via a service URL submission,
 * which is a larger set than you'd think. Sending users to a visually
 * empty page is worse than hiding the row.
 */

// Order matches the streaming-host priority used by ExternalLinks
// (Bandcamp → Spotify → Apple Music → Tidal → Qobuz → SoundCloud →
// YouTube), then everything else Odesli might return. Note: Bandcamp
// and Qobuz aren't included in Odesli's free-tier responses, but
// they're listed at the top in case the API begins surfacing them.
const PLATFORM_ORDER: { key: string; label: string; host: string }[] = [
  { key: "bandcamp", label: "Bandcamp", host: "bandcamp.com" },
  { key: "spotify", label: "Spotify", host: "spotify.com" },
  { key: "appleMusic", label: "Apple Music", host: "music.apple.com" },
  { key: "tidal", label: "Tidal", host: "tidal.com" },
  { key: "qobuz", label: "Qobuz", host: "qobuz.com" },
  { key: "soundcloud", label: "SoundCloud", host: "soundcloud.com" },
  { key: "youtubeMusic", label: "YouTube Music", host: "music.youtube.com" },
  { key: "youtube", label: "YouTube", host: "youtube.com" },
  { key: "deezer", label: "Deezer", host: "deezer.com" },
  { key: "amazonMusic", label: "Amazon Music", host: "music.amazon.com" },
  { key: "pandora", label: "Pandora", host: "pandora.com" },
  { key: "anghami", label: "Anghami", host: "anghami.com" },
  { key: "boomplay", label: "Boomplay", host: "boomplay.com" },
  { key: "audiomack", label: "Audiomack", host: "audiomack.com" },
  { key: "audius", label: "Audius", host: "audius.co" },
  { key: "napster", label: "Napster", host: "napster.com" },
  { key: "yandex", label: "Yandex Music", host: "music.yandex.com" },
  { key: "itunes", label: "iTunes Store", host: "itunes.apple.com" },
  { key: "amazonStore", label: "Amazon Store", host: "amazon.com" },
];

function favicon(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
}

interface OdesliLinksProps {
  /** Service URL to seed Odesli with — typically the first MB streaming url-rel. */
  seedUrl?: string | null;
  /**
   * Full set of MB streaming url-rels for the entity. Used two ways:
   *   1. Bandcamp / Qobuz / etc. that Odesli doesn't return — we
   *      surface them at the end of the row instead of dropping
   *      them on the floor.
   *   2. Fallback when Odesli is empty / rate-limited — we still
   *      render whatever MB knew about so the user keeps their
   *      streaming affordances.
   * Deduped against Odesli output by hostname so users never see the
   * same service twice. Pass `[]` (or omit) when no MB streaming
   * rels are available.
   */
  mbStreamingLinks?: ArtistExternalLink[];
  /** When provided, append a "+" tile linking to the recording's MB
   *  edit-relationships page so users can wire up additional URLs. */
  recordingMbid?: string | null;
}

export async function OdesliLinks({
  seedUrl,
  mbStreamingLinks = [],
  recordingMbid,
}: OdesliLinksProps) {
  // When we have an MBID, route through the cache-first resolver so
  // we surface anything Parachord has actively-confirmed (its
  // submissions outrank Odesli + MB on tie-breaks) and skip redundant
  // Odesli calls on cache hits. Without an MBID (currently no
  // callers — recording pages always have one — but kept for
  // safety) fall back to the direct Odesli path.
  let items: { url: string; label: string; host: string }[] = [];
  let songLinkPageUrl: string | null = null;
  if (recordingMbid) {
    items = await resolveTrackLinks({
      mbid: recordingMbid,
      seedUrl,
      prefetched: {
        streamingUrls: mbStreamingLinks.map((m) => ({
          url: m.url,
          type: m.type,
        })),
      },
    });
  } else {
    const data = seedUrl ? await getOdesliLinks(seedUrl) : null;
    if (data) {
      for (const p of PLATFORM_ORDER) {
        const link = data.linksByPlatform[p.key];
        if (link?.url)
          items.push({ url: link.url, label: p.label, host: p.host });
      }
      songLinkPageUrl = data.pageUrl ?? null;
    }
    // Mirror the legacy MB-merge step for non-MBID callers.
    for (const mb of mbStreamingLinks) {
      const normalised = normalizeStreamingUrl(mb.url);
      if (!normalised) continue;
      let hostname: string;
      try {
        hostname = new URL(normalised).hostname.toLowerCase();
      } catch {
        continue;
      }
      const dup = items.some((it) => hostname.includes(it.host));
      if (dup) continue;
      items.push({
        url: normalised,
        label: tooltipLabel(mb),
        host: hostname.replace(/^(www|m|open|music|web|en)\./, ""),
      });
    }
  }

  // Render nothing if we have no items AND no MBID for the "Add sources"
  // affordance — no signal to show.
  if (items.length === 0 && !recordingMbid) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2" role="list">
      {items.map((it) => (
        <FaviconLink
          key={it.url}
          url={it.url}
          label={it.label}
          host={it.host}
        />
      ))}
      {songLinkPageUrl && (
        <FaviconLink
          url={songLinkPageUrl}
          label="All services (song.link)"
          host="song.link"
        />
      )}
      {recordingMbid && (
        <li>
          <AddSourcesButton mbEntity="recording" mbid={recordingMbid} />
        </li>
      )}
    </ul>
  );
}

function FaviconLink({
  url,
  label,
  host,
}: {
  url: string;
  label: string;
  host: string;
}) {
  // Strip the country / locale segment so Apple Music / iTunes /
  // Spotify auto-route to the user's storefront. Odesli responses are
  // scoped to the userCountry we ask for; stripping the segment lets
  // those URLs work for users elsewhere too.
  const href = normalizeStreamingUrl(url);
  // `null` for unsafe schemes (javascript:, data:, …) or parse
  // failure — Odesli is well-behaved but the data is third-party.
  if (href === null) return null;
  return (
    <li>
      <IconTooltip label={label}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          suppressHydrationWarning
          className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex size-9 items-center justify-center rounded-md border transition-colors pointer-coarse:size-11"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={favicon(host)}
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
}

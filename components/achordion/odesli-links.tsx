import { getOdesliLinks } from "@/lib/clients/odesli";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { AddSourcesButton } from "./add-sources-button";

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

const PLATFORM_ORDER: { key: string; label: string; host: string }[] = [
  { key: "spotify", label: "Spotify", host: "spotify.com" },
  { key: "appleMusic", label: "Apple Music", host: "music.apple.com" },
  { key: "youtubeMusic", label: "YouTube Music", host: "music.youtube.com" },
  { key: "youtube", label: "YouTube", host: "youtube.com" },
  { key: "tidal", label: "Tidal", host: "tidal.com" },
  { key: "deezer", label: "Deezer", host: "deezer.com" },
  { key: "amazonMusic", label: "Amazon Music", host: "music.amazon.com" },
  { key: "soundcloud", label: "SoundCloud", host: "soundcloud.com" },
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
  /** When provided, append a "+" tile linking to the recording's MB
   *  edit-relationships page so users can wire up additional URLs. */
  recordingMbid?: string | null;
}

export async function OdesliLinks({
  seedUrl,
  recordingMbid,
}: OdesliLinksProps) {
  const data = seedUrl ? await getOdesliLinks(seedUrl) : null;

  // Build the row of platform icons from Odesli, in preferred order.
  const items: { url: string; label: string; host: string }[] = [];
  if (data) {
    for (const p of PLATFORM_ORDER) {
      const link = data.linksByPlatform[p.key];
      if (link?.url) items.push({ url: link.url, label: p.label, host: p.host });
    }
  }

  // Render nothing if Odesli has nothing AND we have no MBID for the
  // "Add sources" affordance — no signal to show.
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
      {data?.pageUrl && (
        <FaviconLink
          url={data.pageUrl}
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
  return (
    <li>
      <IconTooltip label={label}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          suppressHydrationWarning
          className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex size-9 items-center justify-center rounded-md border transition-colors"
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

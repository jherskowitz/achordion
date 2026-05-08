import { NextResponse, type NextRequest } from "next/server";
import { getOdesliLinks } from "@/lib/clients/odesli";
import {
  getRecording,
  partitionArtistRelations,
} from "@/lib/clients/musicbrainz";
import {
  getCachedTrackLinks,
  setCachedTrackLinks,
  type CachedLink,
} from "@/lib/track-links-store";

/**
 * Resolve a track's external streaming links on demand. Pulled by the
 * `<InlineTrackLinks>` button when a user expands the per-row expand
 * affordance — keeps the up-front render cost zero and only pays the
 * Odesli / MB roundtrip on the first click per track.
 *
 * Inputs (any subset acceptable):
 *   - `mbid` (preferred) — recording MBID. We pull MB url-rels for the
 *     full set of streaming services + use the first as the Odesli
 *     seed.
 *   - `artist` + `title` — fallback when no MBID. Kicks the request
 *     through `recordingHref({artist,title})` → /recording/lookup
 *     internally so we get an MBID anyway, then proceed.
 *   - `seedUrl` — explicit Odesli seed (a service URL the caller
 *     already has). Skips MB entirely when present.
 *
 * Response: `{ links: [{ url, label, host }] }`. Empty list when
 * Odesli + MB both come up empty.
 *
 * Cached: `s-maxage=86400` since per-track streaming-link mappings
 * are essentially static once Odesli has them indexed. Not
 * `private` — the response is the same for every viewer.
 */

const CACHE_HEADERS: Record<string, string> = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

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
];

interface ResolvedLink {
  url: string;
  label: string;
  host: string;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim() || null;
  const seedUrl = url.searchParams.get("seedUrl")?.trim() || null;

  // Read-through cache: when we have an MBID, check the persistent
  // store first. Hit → return immediately. Miss → resolve via
  // Odesli + MB, write back below. Survives Next data-cache
  // resets on deploy and bypasses Odesli's rate limit on cached
  // tracks.
  if (mbid) {
    const cached = await getCachedTrackLinks(mbid);
    if (cached && cached.length > 0) {
      return NextResponse.json(
        { links: cached.map(stripSource) },
        { headers: CACHE_HEADERS },
      );
    }
  }

  // Resolve MB url-rels when an mbid is on hand — gives us streaming
  // services Odesli doesn't cover (Bandcamp, Qobuz) AND a seed URL
  // for Odesli when the caller didn't supply one. Track / artist /
  // album names from the recording become cache metadata so the
  // stored entry is self-describing.
  let mbStreamingUrls: { url: string; type: string }[] = [];
  let mbNames: { trackName?: string; artistName?: string; albumName?: string } =
    {};
  if (mbid) {
    try {
      const recording = await getRecording(mbid);
      const { urls } = partitionArtistRelations({
        relations: recording.relations,
      });
      mbStreamingUrls = urls
        .filter((u) =>
          /\b(spotify|apple|youtube|tidal|deezer|bandcamp|qobuz|soundcloud|amazon|pandora)\b/i.test(
            u.url,
          ),
        )
        .map((u) => ({ url: u.url, type: u.type }));
      const artistName = recording["artist-credit"]
        ?.map((c) => c.name + (c.joinphrase ?? ""))
        .join("")
        .trim();
      // Pick the earliest official release as the canonical album
      // name — matches how the recording page picks its hero album.
      const release = (recording.releases ?? [])
        .slice()
        .sort((a, b) =>
          (a.date ?? "9999").localeCompare(b.date ?? "9999"),
        )[0];
      mbNames = {
        trackName: recording.title,
        ...(artistName ? { artistName } : {}),
        ...(release?.title ? { albumName: release.title } : {}),
      };
    } catch {
      // MB unreachable — degrade to Odesli-only.
    }
  }

  const odesliSeed = seedUrl ?? mbStreamingUrls[0]?.url ?? null;
  const odesli = odesliSeed
    ? await getOdesliLinks(odesliSeed).catch(() => null)
    : null;

  const items: ResolvedLink[] = [];
  const seen = new Set<string>();

  if (odesli) {
    for (const p of PLATFORM_ORDER) {
      const link = odesli.linksByPlatform[p.key];
      if (link?.url) {
        items.push({ url: link.url, label: p.label, host: p.host });
        seen.add(p.host);
      }
    }
  }

  // Append MB-only entries (Bandcamp, Qobuz, niche services) Odesli
  // didn't cover. Dedupe by hostname containment so open.spotify.com
  // doesn't double up with spotify.com etc.
  for (const mb of mbStreamingUrls) {
    const h = hostOf(mb.url);
    if (!h) continue;
    if ([...seen].some((s) => h === s || h.includes(s))) continue;
    items.push({
      url: mb.url,
      label: prettyLabel(h),
      host: h,
    });
    seen.add(h);
  }

  // Write-through to the persistent cache. We can only key by MBID
  // (the cache contract) — drop the write when the lookup was seed-
  // URL-only. Tag each link with its origin so future merges from
  // Parachord can override appropriately. Pass MB-derived names so
  // the stored entry is self-describing on inspection.
  if (mbid && items.length > 0) {
    const tagged: CachedLink[] = [];
    for (const item of items) {
      const fromOdesli = !!odesli?.linksByPlatform &&
        Object.values(odesli.linksByPlatform).some(
          (l) => l?.url === item.url,
        );
      tagged.push({
        ...item,
        source: fromOdesli ? "odesli" : "mb",
      });
    }
    // Don't await — let the response return while the cache write
    // happens in the background. Best-effort either way.
    void setCachedTrackLinks(mbid, tagged, mbNames);
  }

  return NextResponse.json({ links: items }, { headers: CACHE_HEADERS });
}

/** Drop the internal `source` tag before sending links to clients —
 *  the public response shape stays `{ url, label, host }`. */
function stripSource(link: CachedLink) {
  return { url: link.url, label: link.label, host: link.host };
}

function prettyLabel(host: string): string {
  // Strip leading subdomains and the TLD for a cleaner display label.
  const parts = host.split(".");
  if (parts.length >= 2) {
    return capitalise(parts[parts.length - 2]);
  }
  return capitalise(host);
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}


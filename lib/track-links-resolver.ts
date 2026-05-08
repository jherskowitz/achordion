import "server-only";

import { getOdesliLinks } from "@/lib/clients/odesli";
import {
  formatArtistCredit,
  getRecording,
  getReleaseGroup,
  partitionArtistRelations,
} from "@/lib/clients/musicbrainz";
import {
  canonicalHost,
  getCachedTrackLinks,
  getCachedTrackLinksByIsrcs,
  setCachedTrackLinks,
  type CachedLink,
  type LinkEntity,
  type TrackNames,
} from "@/lib/track-links-store";

/**
 * Server-side resolver for a recording's external streaming links.
 *
 * Single source of truth for the "where can I play this track?"
 * question — used by `/api/track-links` (client expansions in
 * <InlineTrackLinks>) AND directly from server components like the
 * embed widget at `/embed/track/[mbid]`. Keeping both paths on the
 * same resolver guarantees the persistent cache is checked first
 * regardless of where the lookup originated.
 *
 * Resolution order:
 *   1. Persistent cache (Upstash, see `lib/track-links-store.ts`).
 *      Hit → return immediately.
 *   2. MusicBrainz url-rels — full coverage of services Odesli
 *      doesn't index (Bandcamp, Qobuz, niche services). Skipped
 *      when the caller passes `prefetched` (their own fetch).
 *   3. Odesli — cross-service lookup keyed off the first MB
 *      streaming rel (or an explicit `seedUrl`). Fills in
 *      Spotify / Apple Music / YouTube / Tidal / etc.
 *   4. Write-through to the persistent cache so the next caller
 *      gets a hit (and we save Odesli rate-limit budget).
 *
 * Errors at any external step degrade gracefully: a MB outage
 * doesn't kill an Odesli result, an Odesli outage doesn't kill MB
 * coverage. Returns an empty list when both fail.
 */

export interface ResolvedLink {
  url: string;
  label: string;
  host: string;
}

interface ResolveTrackLinksOpts {
  /** Recording or release-group MBID — required for cache
   *  reads/writes. */
  mbid?: string | null;
  /** Which MB entity the MBID refers to. Determines the cache
   *  namespace and which MB endpoint we hit on a miss. Defaults to
   *  `recording` for back-compat with track-link callers. */
  entity?: LinkEntity;
  /** Explicit Odesli seed. When omitted, the first MB streaming
   *  rel is used. */
  seedUrl?: string | null;
  /**
   * Optional pre-fetched MB data. When the caller already loaded the
   * entity (e.g. the embed page's hero block, or a release-group
   * page that already has its url-rels), pass the streaming url-rels
   * + names through here to skip a duplicate MB round-trip on cache
   * miss.
   */
  prefetched?: {
    streamingUrls: { url: string; type?: string }[];
    names?: TrackNames;
  };
}

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

const STREAMING_HOST_PATTERN =
  /\b(spotify|apple|youtube|tidal|deezer|bandcamp|qobuz|soundcloud|amazon|pandora)\b/i;

export async function resolveTrackLinks(
  opts: ResolveTrackLinksOpts,
): Promise<ResolvedLink[]> {
  const { mbid, seedUrl, prefetched } = opts;
  const entity: LinkEntity = opts.entity ?? "recording";

  // 1. Cache hit short-circuits every external call.
  if (mbid) {
    const cached = await getCachedTrackLinks(mbid, entity);
    if (cached && cached.length > 0) {
      return sortByPlatformPriority(
        cached.map(({ url, label, host }) => ({ url, label, host })),
      );
    }
  }

  // 2. MB url-rels — pre-fetched by the caller, or fetched here.
  // For recordings we also pull ISRCs so we can try ISRC aliases
  // before falling through to Odesli (handles the "same audio
  // modeled as different MBIDs" case — single vs album-track
  // variants typically share an ISRC).
  let mbStreamingUrls: { url: string; type?: string }[] = [];
  let mbNames: TrackNames = {};
  let isrcs: string[] = [];
  if (prefetched) {
    mbStreamingUrls = prefetched.streamingUrls.filter((u) =>
      STREAMING_HOST_PATTERN.test(u.url),
    );
    mbNames = prefetched.names ?? {};
  } else if (mbid) {
    try {
      if (entity === "release-group") {
        // For release-groups the rg-level url-rels are often sparse,
        // but we don't fetch the linked releases here — that'd be a
        // second roundtrip per resolution. Callers that need richer
        // url coverage (e.g. the album page) pre-fetch + dedup
        // release-level rels themselves and pass via `prefetched`.
        const rg = await getReleaseGroup(mbid);
        const { urls } = partitionArtistRelations(rg);
        mbStreamingUrls = urls
          .filter((u) => STREAMING_HOST_PATTERN.test(u.url))
          .map((u) => ({ url: u.url, type: u.type }));
        const credit = formatArtistCredit(rg["artist-credit"]);
        mbNames = {
          albumName: rg.title,
          ...(credit.name ? { artistName: credit.name } : {}),
        };
      } else {
        const recording = await getRecording(mbid);
        isrcs = recording.isrcs ?? [];
        const { urls } = partitionArtistRelations({
          relations: recording.relations,
        });
        mbStreamingUrls = urls
          .filter((u) => STREAMING_HOST_PATTERN.test(u.url))
          .map((u) => ({ url: u.url, type: u.type }));
        const artistName = recording["artist-credit"]
          ?.map((c) => c.name + (c.joinphrase ?? ""))
          .join("")
          .trim();
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
      }
    } catch {
      // MB unreachable — degrade to Odesli-only.
    }
  }

  // 2.5. ISRC alias fallback (recording entities only). The same
  // audio is often modeled as two distinct recordings in MB —
  // typically a single MBID and an album-track MBID. Parachord might
  // have submitted streaming URLs under one but not the other.
  // Reach across via ISRC before paying for an Odesli call.
  if (entity === "recording" && mbid && isrcs.length > 0) {
    const aliasHit = await getCachedTrackLinksByIsrcs(isrcs);
    if (aliasHit && aliasHit.length > 0) {
      // Back-fill the per-MBID cache so subsequent direct lookups
      // don't have to walk the alias path again. Names + ISRCs go
      // along so the entry stays self-describing.
      void setCachedTrackLinks(mbid, aliasHit, mbNames, "recording", {
        isrcs,
      });
      return sortByPlatformPriority(
        aliasHit.map(({ url, label, host }) => ({ url, label, host })),
      );
    }
  }

  // 3. Odesli.
  const odesliSeed = seedUrl ?? mbStreamingUrls[0]?.url ?? null;
  const odesli = odesliSeed
    ? await getOdesliLinks(odesliSeed).catch(() => null)
    : null;

  // 4. Assemble + dedupe by host.
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

  for (const mb of mbStreamingUrls) {
    const h = hostOf(mb.url);
    if (!h) continue;
    if ([...seen].some((s) => h === s || h.includes(s))) continue;
    items.push({ url: mb.url, label: prettyLabel(h), host: h });
    seen.add(h);
  }

  // 5. Write-through. Tag each link with its origin so future
  // Parachord submissions can override on priority. Background-write
  // — let the response return immediately.
  if (mbid && items.length > 0) {
    const tagged: CachedLink[] = items.map((item) => {
      const fromOdesli =
        !!odesli?.linksByPlatform &&
        Object.values(odesli.linksByPlatform).some(
          (l) => l?.url === item.url,
        );
      return { ...item, source: fromOdesli ? "odesli" : "mb" };
    });
    void setCachedTrackLinks(
      mbid,
      tagged,
      mbNames,
      entity,
      // ISRC aliases are recording-only; the writer ignores them
      // when entity is "release-group". Pass even on miss-then-
      // resolve so future cross-MBID lookups via ISRC work.
      isrcs.length > 0 ? { isrcs } : undefined,
    );
  }

  return sortByPlatformPriority(items);
}

/**
 * Re-order links to match PLATFORM_ORDER regardless of how they
 * arrived (Odesli output is already ordered, MB merge appends
 * niche services at the end, but Parachord submissions land in
 * whatever order Parachord sent them and the cache merge preserves
 * insertion order — meaning a cache hit could surface Spotify
 * after YouTube, etc.). Hosts not in PLATFORM_ORDER fall to the
 * end in their original order (stable sort by `original` index).
 */
function sortByPlatformPriority(items: ResolvedLink[]): ResolvedLink[] {
  const orderIndex = (host: string): number => {
    const h = canonicalHost(host);
    const idx = PLATFORM_ORDER.findIndex((p) => p.host === h);
    return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
  };
  return items
    .map((item, i) => ({ item, idx: orderIndex(item.host), original: i }))
    .sort((a, b) =>
      a.idx !== b.idx ? a.idx - b.idx : a.original - b.original,
    )
    .map(({ item }) => item);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function prettyLabel(host: string): string {
  const parts = host.split(".");
  if (parts.length >= 2) {
    return capitalise(parts[parts.length - 2]);
  }
  return capitalise(host);
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

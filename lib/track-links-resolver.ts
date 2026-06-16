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
  getCachedTrackEntry,
  getCachedTrackLinksByIsrcs,
  getCachedTrackLinksByName,
  setCachedTrackLinks,
  type CachedLink,
  type LinkEntity,
  type TrackNames,
} from "@/lib/track-links-store";
import { isFeatureEnabled } from "@/lib/flags";
import { pickOdesliSeed } from "@/lib/odesli-seed";

/** Kill-switch flag for the one-time Odesli enrichment pass. Global
 *  default-only (no viewer at this edge-cached resolve path), so it's
 *  flipped via `SET flag:track-links-enrichment:default on|off`. */
const ENRICHMENT_FLAG = "track-links-enrichment";

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

  // 1. Cache hit short-circuits every external call. One exception: an
  // enriched scrobble may pass a `seedUrl` for a service the cached set
  // doesn't list yet (the listener played it somewhere new). Merge that
  // single new host in (fill-only `parachord-scrobble`) so a track's
  // coverage grows over time. Fire-and-forget, and only when the host is
  // genuinely new, so cached tracks normally stay a pure read.
  if (mbid) {
    const entry = await getCachedTrackEntry(mbid, entity);
    if (entry && entry.links.length > 0) {
      const cached = entry.links;
      // One-time Odesli enrichment: an entry born from a Parachord
      // submit (or a partial MB resolve) only lists the services that
      // source knew about. Fire a single background Odesli lookup to
      // fold in the rest, so the cache becomes the union of every
      // source — never overriding the higher-priority links it already
      // has. Flag-gated kill-switch; fire-and-forget so the hit stays
      // fast; marked done inside so it never repeats.
      if (!entry.odesliEnriched) {
        void maybeEnrichWithOdesli(mbid, entity, cached, seedUrl ?? null);
      }
      const seedLink = newSeedLink(cached, seedUrl);
      if (seedLink) {
        void setCachedTrackLinks(mbid, [seedLink], undefined, entity);
        return sortByPlatformPriority(
          [...cached, seedLink].map(({ url, label, host }) => ({
            url,
            label,
            host,
          })),
        );
      }
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

  // 2.6. Name alias fallback (recording entities only). Last resort
  // before paying for Odesli: when the same song is modeled as two
  // recording MBIDs and NEITHER carries an ISRC (so 2.5 can't fire),
  // bridge on exact (artist, title). The alias key includes the
  // artist (covers never match) and the exact title (live/demo/remix
  // variants carry MB's parenthetical ETI, so they key differently
  // and never inherit the studio recording's links). Back-fill the
  // per-MBID cache on a hit so the next lookup is a direct hit.
  if (
    entity === "recording" &&
    mbid &&
    mbNames.artistName &&
    mbNames.trackName
  ) {
    const nameHit = await getCachedTrackLinksByName(
      mbNames.artistName,
      mbNames.trackName,
    );
    if (nameHit && nameHit.length > 0) {
      void setCachedTrackLinks(
        mbid,
        nameHit,
        mbNames,
        "recording",
        isrcs.length > 0 ? { isrcs } : undefined,
      );
      return sortByPlatformPriority(
        nameHit.map(({ url, label, host }) => ({ url, label, host })),
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

  // 4.5. Played source (parachord-scrobble). When the caller passed a
  // `seedUrl` — the origin_url Parachord reported it streamed from —
  // keep that exact link if no better source already covers its host.
  // This guarantees a track that was actually played retains at least
  // its played-from link even when Odesli can't expand it (the residual
  // gap after #1). Tagged `parachord-scrobble` below so the store ranks
  // it lowest: fills gaps, never overrides odesli/mb/parachord.
  if (seedUrl) {
    const h = hostOf(seedUrl);
    if (h && ![...seen].some((s) => h === s || h.includes(s))) {
      items.push({ url: seedUrl, label: prettyLabel(h), host: h });
      seen.add(h);
    }
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
      if (fromOdesli) return { ...item, source: "odesli" as const };
      // The played-source link we just appended (only present when it
      // filled a host Odesli/MB didn't) → lowest-priority scrobble tag.
      if (seedUrl && item.url === seedUrl) {
        return { ...item, source: "parachord-scrobble" as const };
      }
      return { ...item, source: "mb" as const };
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
      // We consulted Odesli on this miss (got a response, even if it
      // had no links) → mark enriched so a later cache hit doesn't
      // re-run the one-time enrichment pass. A failed/throttled Odesli
      // call (null) leaves it unmarked so enrichment retries later.
      { odesliEnriched: odesli != null },
    );
  }

  return sortByPlatformPriority(items);
}

/**
 * One-time Odesli enrichment of an already-cached entry.
 *
 * Entries created by a Parachord submit (or a partial MB resolve)
 * carry only the services that source knew about. This folds in
 * Odesli's cross-service set so the cache trends toward the union of
 * every source — the long-term goal of making our DB the primary
 * link source. Merge priority means Odesli never overrides a
 * Parachord-confirmed or MB link; it only fills hosts nothing better
 * covered.
 *
 * Fire-and-forget from the cache-hit path. Guards:
 *   - Kill-switch flag (global default-only — no viewer here).
 *   - Marks the entry enriched on any Odesli *response* (even an empty
 *     one) so it never repeats; a transient failure (null) stays
 *     unmarked and retries on a later resolve.
 *   - Bounded to once per track by the marker, and Odesli's own 24h
 *     fetch cache + fail-fast-on-429 keep the cost contained.
 */
async function maybeEnrichWithOdesli(
  mbid: string,
  entity: LinkEntity,
  cachedLinks: CachedLink[],
  seedUrl: string | null,
): Promise<void> {
  try {
    if (!(await isFeatureEnabled(ENRICHMENT_FLAG))) return;
    const seed = pickOdesliSeed(cachedLinks, seedUrl);
    if (!seed) return;
    const odesli = await getOdesliLinks(seed).catch(() => null);
    // null = error / rate-limit / timeout — leave unmarked, retry later.
    if (!odesli) return;
    const odesliLinks: CachedLink[] = [];
    for (const p of PLATFORM_ORDER) {
      const link = odesli.linksByPlatform[p.key];
      if (link?.url) {
        odesliLinks.push({
          url: link.url,
          label: p.label,
          host: p.host,
          source: "odesli",
        });
      }
    }
    // Write the Odesli links in (merged by priority) AND mark enriched.
    // Empty odesliLinks still flips the marker so we don't re-run.
    await setCachedTrackLinks(mbid, odesliLinks, undefined, entity, undefined, {
      odesliEnriched: true,
    });
  } catch {
    // Best-effort enrichment — never affects the served response.
  }
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

/**
 * If `seedUrl` (an enriched scrobble's played source) names a streaming
 * host the cached set doesn't already have, return it as a fill-only
 * `parachord-scrobble` link to merge in; otherwise null. Lets a track
 * accumulate services as it gets played from new sources, without ever
 * overriding an existing (higher-priority) link for a host we already
 * have.
 */
function newSeedLink(
  cached: CachedLink[],
  seedUrl: string | null | undefined,
): CachedLink | null {
  if (!seedUrl) return null;
  const host = hostOf(seedUrl);
  if (!host) return null;
  const have = new Set(cached.map((l) => canonicalHost(l.host)));
  if (have.has(canonicalHost(host))) return null;
  return {
    url: seedUrl,
    label: prettyLabel(host),
    host,
    source: "parachord-scrobble",
  };
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

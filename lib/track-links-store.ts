import "server-only";

import { Redis } from "@upstash/redis";
import { revalidateTag, unstable_cache } from "next/cache";
import { canonicalHost } from "@/lib/host";
import { nameAliasKey } from "@/lib/track-links-key";

// Re-export so existing call sites that import canonicalHost from
// here keep working.
export { canonicalHost };

/**
 * Persistent MBID → external-links cache, backed by Upstash Redis.
 *
 * Wraps a single JSON blob per recording MBID. We deliberately use
 * one key per track (rather than a Redis Hash) so the read path is
 * a single GET — cheaper for the hottest path (every track-row link
 * expansion fires a GET). Writes are full replacements that merge
 * old + new locally before SETting.
 *
 * Sources tracked per link:
 *   - "odesli"    — resolved from Odesli's cross-service lookup.
 *   - "mb"        — resolved from a MusicBrainz url-rel.
 *   - "parachord" — actively-confirmed match Parachord pushed via
 *     /api/track-links/submit (most authoritative since Parachord
 *     played it to confirm).
 *
 * When merging entries with the same host, the higher-priority
 * source wins: parachord > odesli > mb.
 *
 * TTL: 90 days. After expiry the read returns null and the caller
 * re-resolves; the freshly-resolved entry overwrites with a new
 * 90-day TTL.
 *
 * Falls back to a no-op when Upstash env vars aren't set (local
 * dev without Redis) — `getCachedTrackLinks` returns null,
 * `setCachedTrackLinks` is a no-op, and the route degrades to its
 * pre-cache behavior.
 */

export type LinkSource = "odesli" | "mb" | "parachord";

export interface CachedLink {
  url: string;
  /** Human label, e.g. "Spotify". */
  label: string;
  /** Hostname for favicon lookup + dedupe key. */
  host: string;
  /** Where this entry came from — drives the merge priority. */
  source: LinkSource;
}

interface CachedEntry {
  /** Recording MBID this entry is for (denormalised for safety). */
  mbid: string;
  /** Deduped, source-tagged links. */
  links: CachedLink[];
  /** Unix seconds — when we resolved this entry. */
  resolved_at: number;
  /**
   * Track / artist / album names captured at resolve time. Optional —
   * older cache entries (or write paths that didn't have them on
   * hand) may omit. Used for cache introspection ("what is
   * track-links:<mbid> actually for") and to power future features
   * (search-by-name over the cache without an MB round-trip).
   *
   * These are point-in-time snapshots; MB editors can rename. The
   * cache TTL is the staleness ceiling — re-resolution after expiry
   * picks up any updates.
   */
  track_name?: string;
  artist_name?: string;
  album_name?: string;
}

/**
 * Optional name metadata callers can attach when writing. The store
 * itself doesn't enforce any of these — passing them through enriches
 * the stored entry; omitting just means future debugging will need an
 * MB fetch to identify the track.
 */
export interface TrackNames {
  trackName?: string;
  artistName?: string;
  albumName?: string;
}

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

const SOURCE_PRIORITY: Record<LinkSource, number> = {
  parachord: 3,
  odesli: 2,
  mb: 1,
};

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/** Entity types we cache external links for. Recordings = per-track
 *  Spotify / Apple Music / etc. URLs; release-groups = per-album.
 *  Use a separate key namespace per entity so a track and an album
 *  with the same MBID-shaped UUID (theoretically possible) don't
 *  collide. */
export type LinkEntity = "recording" | "release-group";

function key(mbid: string, entity: LinkEntity = "recording"): string {
  // Recording keeps the legacy `track-links:<mbid>` shape so the
  // existing corpus + Parachord-submitted entries don't need
  // migration. Release-group adds an explicit prefix.
  if (entity === "recording") return `track-links:${mbid.toLowerCase()}`;
  return `track-links:${entity}:${mbid.toLowerCase()}`;
}

/** Alias-key for an ISRC. Points at the same JSON shape as a
 *  primary recording entry so reads can hit it directly without a
 *  redirect lookup.
 *
 *  ISRCs are case-insensitive (the spec defines them as uppercase
 *  alphanumerics, but real-world data has both forms). Normalise to
 *  upper before keying so writes from different sources collapse.
 */
function isrcKey(isrc: string): string {
  return `track-links:isrc:${isrc.trim().toUpperCase()}`;
}

/** Tag used by unstable_cache + revalidateTag so write-throughs
 *  immediately invalidate the Next-layer cache for an entry. */
function cacheTag(mbid: string, entity: LinkEntity): string {
  return `track-links:${entity}:${mbid.toLowerCase()}`;
}

/**
 * Raw Redis read — bypasses the Next-layer cache. Internal only;
 * the public `getCachedTrackLinks` wraps this in `unstable_cache`
 * so hot reads within the TTL window don't re-hit Upstash.
 */
async function readCachedTrackLinksFromRedis(
  mbid: string,
  entity: LinkEntity,
): Promise<CachedLink[] | null> {
  if (!redis) return null;
  if (!mbid) return null;
  try {
    const raw = await redis.get<CachedEntry | string | null>(
      key(mbid, entity),
    );
    if (!raw) return null;
    const entry = typeof raw === "string" ? (JSON.parse(raw) as CachedEntry) : raw;
    if (!Array.isArray(entry.links)) return null;
    return entry.links;
  } catch {
    return null;
  }
}

/**
 * Look up cached external links for an entity. Returns null on
 * miss / expired / Upstash-not-configured. Caller should treat null
 * as "go resolve and write back."
 *
 * `entity` defaults to `"recording"` for back-compat with existing
 * call sites; pass `"release-group"` for album-level lookups.
 *
 * **Two-level caching:** the Redis read is wrapped in Next's
 * `unstable_cache` (60s TTL, tagged per (entity, mbid) pair). Hot
 * reads on the same node within the window avoid re-hitting
 * Upstash entirely — significant when a popular recording renders
 * across multiple surfaces in quick succession. Writes invalidate
 * via `revalidateTag` in `setCachedTrackLinks`, so newly-submitted
 * Parachord URLs surface immediately rather than waiting for the
 * 60s TTL to lapse.
 */
export async function getCachedTrackLinks(
  mbid: string,
  entity: LinkEntity = "recording",
): Promise<CachedLink[] | null> {
  if (!mbid) return null;
  // unstable_cache requires the closure to be stable across renders;
  // we capture the entity + mbid in the cache key list so each
  // (entity, mbid) pair gets its own cache slot.
  const cached = unstable_cache(
    () => readCachedTrackLinksFromRedis(mbid, entity),
    [`track-links`, entity, mbid.toLowerCase()],
    { revalidate: 60, tags: [cacheTag(mbid, entity)] },
  );
  return cached();
}

/**
 * Look up cached external links by ISRC alias. ISRCs uniquely
 * identify a recording's *audio*, so this resolves the case where
 * the same audio appears as two distinct recording MBIDs (single
 * vs album-track variants are the most common shape) and we have
 * cached links for one MBID but not the other.
 *
 * Returns the first non-null entry across the supplied ISRCs.
 * Caller is responsible for back-filling the per-MBID cache after
 * a successful ISRC hit so subsequent direct lookups are fast.
 */
export async function getCachedTrackLinksByIsrcs(
  isrcs: string[],
): Promise<CachedLink[] | null> {
  if (!redis) return null;
  if (!isrcs || isrcs.length === 0) return null;
  for (const isrc of isrcs) {
    if (!isrc) continue;
    try {
      const raw = await redis.get<CachedEntry | string | null>(isrcKey(isrc));
      if (!raw) continue;
      const entry = typeof raw === "string"
        ? (JSON.parse(raw) as CachedEntry)
        : raw;
      if (!Array.isArray(entry.links) || entry.links.length === 0) continue;
      return entry.links;
    } catch {
      // Try the next ISRC.
    }
  }
  return null;
}

/**
 * Look up cached external links by exact (artist, title) name.
 *
 * Last-resort bridge for the "same song, two recording MBIDs" case
 * when neither side carries an ISRC in MusicBrainz (so the ISRC alias
 * can't fire). MB commonly models a song as a single recording AND an
 * album-track recording; streaming links land on one, a listen/pin
 * resolves to the other. ISRC is the correct bridge when present;
 * this name alias covers the gap when it isn't.
 *
 * Safety: the key includes the **artist** (so a cover by a different
 * artist never matches — unlike a composition/Work bridge) and an
 * **exact** title (so MusicBrainz's parenthetical ETI — "(live)",
 * "(demo)", "(… remix)" — produces a different key and never
 * cross-contaminates the studio recording's links). See
 * `lib/track-links-key.ts` for the normalization rationale.
 *
 * Returns null on miss / empty / Upstash-not-configured. Caller
 * back-fills the per-MBID key after a hit so the next lookup is a
 * direct hit.
 */
export async function getCachedTrackLinksByName(
  artistName: string | undefined | null,
  trackName: string | undefined | null,
): Promise<CachedLink[] | null> {
  if (!redis) return null;
  if (!artistName || !trackName) return null;
  const k = nameAliasKey(artistName, trackName);
  if (!k) return null;
  try {
    const raw = await redis.get<CachedEntry | string | null>(k);
    if (!raw) return null;
    const entry =
      typeof raw === "string" ? (JSON.parse(raw) as CachedEntry) : raw;
    if (!Array.isArray(entry.links) || entry.links.length === 0) return null;
    return entry.links;
  } catch {
    return null;
  }
}

/**
 * Merge new links into the cache for an entity. Existing entries
 * with the same host are replaced ONLY when the incoming source has
 * equal or higher priority. Result is written back as a fresh
 * 90-day blob.
 *
 * `entity` defaults to `"recording"` (back-compat).
 *
 * `aliases.isrcs` (recording-only): write the same merged blob to
 * each ISRC alias key as well, so reads for a different recording
 * MBID with overlapping ISRCs find the same data without a separate
 * resolve. ISRCs uniquely identify the *audio*, so this is the
 * right shared key when MB has modeled the same audio as two
 * distinct recordings (single + album-track is the canonical case).
 */
export async function setCachedTrackLinks(
  mbid: string,
  incoming: CachedLink[],
  names?: TrackNames,
  entity: LinkEntity = "recording",
  aliases?: { isrcs?: string[] },
): Promise<void> {
  if (!redis) return;
  if (!mbid) return;
  try {
    // Read the prior entry (full blob, not just links) so we can
    // preserve any name fields the caller didn't supply this time.
    // Keeps the entry self-describing across mixed-source writes.
    let prior: CachedEntry | null = null;
    try {
      const raw = await redis.get<CachedEntry | string | null>(
        key(mbid, entity),
      );
      prior = raw
        ? typeof raw === "string"
          ? (JSON.parse(raw) as CachedEntry)
          : raw
        : null;
    } catch {
      prior = null;
    }
    const existingLinks = Array.isArray(prior?.links) ? prior.links : [];
    const merged = mergeLinks(existingLinks, incoming);
    const entry: CachedEntry = {
      mbid: mbid.toLowerCase(),
      links: merged,
      resolved_at: Math.floor(Date.now() / 1000),
      ...(names?.trackName ?? prior?.track_name
        ? { track_name: names?.trackName ?? prior?.track_name }
        : {}),
      ...(names?.artistName ?? prior?.artist_name
        ? { artist_name: names?.artistName ?? prior?.artist_name }
        : {}),
      ...(names?.albumName ?? prior?.album_name
        ? { album_name: names?.albumName ?? prior?.album_name }
        : {}),
    };
    const serialised = JSON.stringify(entry);
    await redis.set(key(mbid, entity), serialised, { ex: TTL_SECONDS });
    // Invalidate the Next-layer cache for this (entity, mbid) so
    // freshly-submitted links surface immediately rather than
    // waiting for the 60s unstable_cache window to lapse. Next 16
    // requires a `profile` second arg ("default" matches the
    // standard cache profile used by unstable_cache).
    try {
      revalidateTag(cacheTag(mbid, entity), "default");
    } catch {
      // revalidateTag throws when called from a non-render context
      // (e.g., during build static analysis). Best-effort either way.
    }
    // ISRC aliases — only meaningful for recording entities. We
    // duplicate the JSON rather than store a redirect, so reads via
    // an alias don't pay a second round-trip. ISRCs are typically
    // 1-3 per recording so the storage overhead is minor.
    if (entity === "recording" && aliases?.isrcs?.length) {
      for (const isrc of aliases.isrcs) {
        if (!isrc) continue;
        try {
          await redis.set(isrcKey(isrc), serialised, { ex: TTL_SECONDS });
        } catch {
          // Best-effort — primary key already wrote successfully.
        }
      }
    }

    // Name alias (recording-only) — the last-resort bridge for the
    // "same song, different recording MBID, no shared ISRC" case.
    // Keyed off the merged entry's own names (so a write that didn't
    // pass names still aliases when a prior write captured them).
    // Same JSON duplication as ISRC aliases. The key includes the
    // artist + exact title, so covers and live/demo variants never
    // collide — see `getCachedTrackLinksByName`.
    if (entity === "recording" && entry.artist_name && entry.track_name) {
      const nameKeyAlias = nameAliasKey(entry.artist_name, entry.track_name);
      if (nameKeyAlias) {
        try {
          await redis.set(nameKeyAlias, serialised, { ex: TTL_SECONDS });
        } catch {
          // Best-effort — primary key already wrote successfully.
        }
      }
    }
  } catch {
    // Best-effort — caller already has the resolved links, the
    // cache write is just optimisation.
  }
}

/**
 * Deduplicate links by canonical hostname, preferring higher-
 * priority sources. Order in the output mirrors the input platform
 * order (matters for UI rendering — we want Bandcamp / Spotify /
 * Apple at the top). Each stored link's `host` is also canonicalised
 * so future reads return the normalised form.
 */
function mergeLinks(
  existing: CachedLink[],
  incoming: CachedLink[],
): CachedLink[] {
  const byHost = new Map<string, CachedLink>();
  const normalise = (link: CachedLink): CachedLink => ({
    ...link,
    host: canonicalHost(link.host),
  });
  // Existing first so input order can override on tied priority.
  for (const link of existing) byHost.set(canonicalHost(link.host), normalise(link));
  for (const next of incoming) {
    const k = canonicalHost(next.host);
    const prev = byHost.get(k);
    if (
      !prev ||
      SOURCE_PRIORITY[next.source] >= SOURCE_PRIORITY[prev.source]
    ) {
      byHost.set(k, normalise(next));
    }
  }
  return Array.from(byHost.values());
}

/**
 * Force-expire a cache entry. Admin / debug helper — the per-key
 * TTL handles routine refresh, this is for manually busting bad
 * data (e.g. a misresolved link).
 */
export async function clearCachedTrackLinks(
  mbid: string,
  entity: LinkEntity = "recording",
): Promise<void> {
  if (!redis) return;
  await redis.del(key(mbid, entity)).catch(() => {});
}

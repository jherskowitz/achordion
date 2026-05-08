import "server-only";

import { Redis } from "@upstash/redis";
import { canonicalHost } from "@/lib/host";

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

/**
 * Look up cached external links for an entity. Returns null on
 * miss / expired / Upstash-not-configured. Caller should treat null
 * as "go resolve and write back."
 *
 * `entity` defaults to `"recording"` for back-compat with existing
 * call sites; pass `"release-group"` for album-level lookups.
 */
export async function getCachedTrackLinks(
  mbid: string,
  entity: LinkEntity = "recording",
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
 * Merge new links into the cache for an entity. Existing entries
 * with the same host are replaced ONLY when the incoming source has
 * equal or higher priority. Result is written back as a fresh
 * 90-day blob.
 *
 * `entity` defaults to `"recording"` (back-compat).
 */
export async function setCachedTrackLinks(
  mbid: string,
  incoming: CachedLink[],
  names?: TrackNames,
  entity: LinkEntity = "recording",
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
    await redis.set(key(mbid, entity), JSON.stringify(entry), {
      ex: TTL_SECONDS,
    });
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

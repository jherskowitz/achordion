import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Persistent LB-playlist-MBID → external-links cache, backed by Upstash Redis.
 * Mirrors `lib/track-links-store.ts` exactly in shape; separate keyspace.
 *
 * One Redis key per LB playlist MBID:
 *   pl-links:<lb-playlist-mbid> = JSON-encoded {
 *     mbid,
 *     name?,
 *     creatorName?,
 *     trackCount?,
 *     links: [{ host, url, label, source: "parachord" }],
 *     updatedAt
 *   }
 *
 * Why per-LB-MBID and not per-Spotify-ID-or-AM-ID-or-LB-MBID: ListenBrainz is
 * the only provider whose ID is a stable MusicBrainz identifier (UUID).
 * Spotify and AM IDs are platform-specific opaque strings. LB MBID is the
 * natural cross-platform anchor for "this is the same playlist across
 * services," same logic the rest of Achordion uses for tracks/recordings.
 *
 * TTL: 90 days. After expiry the read returns null; the next Parachord
 * submission overwrites with a fresh 90-day TTL.
 */

export type PlaylistLink = {
  host: string;
  url: string;
  label: string;
  source: "parachord";
};

export type PlaylistLinksEntry = {
  mbid: string;
  name?: string;
  creatorName?: string;
  trackCount?: number;
  links: PlaylistLink[];
  updatedAt: number;
};

const KEY_PREFIX = "pl-links:";
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

export async function getPlaylistLinks(mbid: string): Promise<PlaylistLinksEntry | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<PlaylistLinksEntry>(`${KEY_PREFIX}${mbid}`);
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.links)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function setPlaylistLinks(entry: PlaylistLinksEntry): Promise<boolean> {
  if (!redis) return false;
  try {
    await redis.set(`${KEY_PREFIX}${entry.mbid}`, entry, { ex: TTL_SECONDS });
    return true;
  } catch (err) {
    console.warn(`[playlist-links-store] set failed for ${entry.mbid}:`, err);
    return false;
  }
}

import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Bluesky-handle linkage store.
 *
 * One row per opted-in user: the only user-keyed data Achordion
 * persists. Keyed by lower-cased MusicBrainz username (the same
 * identity every other write action uses).
 *
 * Schema (Upstash):
 *   bsky-link:<lb-username>      → JSON { handle, did, verified_at }
 *   bsky-link-by-did:<did>       → <lb-username>     (reverse lookup)
 *
 * Both keys are written together and deleted together. The reverse
 * key powers a future "find Bluesky friends on Achordion" feature
 * without needing to scan; it's cheap to maintain so we set it now.
 *
 * No TTL — the link sticks until the user removes it. Verification
 * is point-in-time: `verified_at` records when we last confirmed the
 * two-way handshake (Bluesky bio contains the Achordion profile URL).
 * Future re-verification can be added without schema changes.
 *
 * Falls back to a no-op when Upstash env vars aren't set, so local
 * dev without Redis still renders cleanly — the feature simply
 * appears "off" to every viewer.
 */

export interface BskyLink {
  handle: string;
  did: string;
  verified_at: number;
}

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function linkKey(lbUsername: string): string {
  return `bsky-link:${lbUsername.toLowerCase()}`;
}

function reverseKey(did: string): string {
  return `bsky-link-by-did:${did}`;
}

export async function getBskyLink(
  lbUsername: string,
): Promise<BskyLink | null> {
  if (!redis || !lbUsername) return null;
  try {
    const raw = await redis.get<BskyLink | string | null>(linkKey(lbUsername));
    if (!raw) return null;
    // Upstash auto-deserialises JSON for us; if the row was set as a
    // string somewhere upstream, parse defensively.
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      parsed &&
      typeof parsed.handle === "string" &&
      typeof parsed.did === "string" &&
      typeof parsed.verified_at === "number"
    ) {
      return parsed as BskyLink;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setBskyLink(
  lbUsername: string,
  link: BskyLink,
): Promise<void> {
  if (!redis || !lbUsername) return;
  // If a previous link existed (different DID), drop its reverse key
  // before writing the new one — otherwise a stale `bsky-link-by-did`
  // would point at this user even after they re-linked elsewhere.
  const existing = await getBskyLink(lbUsername);
  if (existing && existing.did !== link.did) {
    await redis.del(reverseKey(existing.did)).catch(() => {});
  }
  await redis.set(linkKey(lbUsername), link);
  await redis.set(reverseKey(link.did), lbUsername.toLowerCase());
}

export async function deleteBskyLink(lbUsername: string): Promise<void> {
  if (!redis || !lbUsername) return;
  const existing = await getBskyLink(lbUsername);
  await redis.del(linkKey(lbUsername)).catch(() => {});
  if (existing) {
    await redis.del(reverseKey(existing.did)).catch(() => {});
  }
}

/**
 * Reverse lookup: given a Bluesky DID, return the linked MusicBrainz
 * username (or null). Used by future "find your Bluesky follows on
 * Achordion" features. Returns null when Redis isn't configured.
 */
export async function lbUsernameForDid(did: string): Promise<string | null> {
  if (!redis || !did) return null;
  try {
    return await redis.get<string>(reverseKey(did));
  } catch {
    return null;
  }
}

/**
 * Batch reverse lookup. Given many DIDs, returns a map from DID to
 * the linked MusicBrainz username for the ones that match (DIDs
 * with no Achordion linkage are absent from the result).
 *
 * Single Redis MGET round-trip regardless of input size, so safe to
 * call with hundreds of DIDs (e.g. a viewer's full Bluesky follow
 * list). Returns an empty map when Redis isn't configured.
 */
export async function lbUsernamesForDids(
  dids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!redis || dids.length === 0) return out;
  try {
    const keys = dids.map(reverseKey);
    const values = await redis.mget<(string | null)[]>(...keys);
    dids.forEach((did, i) => {
      const v = values[i];
      if (typeof v === "string" && v.length > 0) out.set(did, v);
    });
  } catch {
    // empty map — caller treats that as "no matches" which is the
    // right degraded behaviour for a "find friends" surface.
  }
  return out;
}

import "server-only";

import { Redis } from "@upstash/redis";
import {
  parseScoredMembers,
  type ProfileViewRow,
} from "./profile-views-shape";

/**
 * Admin tracker: which user profiles have been rendered, and how often.
 *
 * Two Upstash structures, both keyed by the viewed profile's username
 * (the `[name]` route param — NOT the viewer, which we don't need):
 *   - `profile-views:count` (sorted set) — `ZINCRBY` per render, so the
 *     score is the running view total. Ranking source.
 *   - `profile-views:last`  (hash) — `HSET` username → unix-seconds of
 *     the most recent render. Looked up for the matching rows.
 *
 * Writes are fire-and-forget from the user-route layout, so they never
 * block or fail a profile render. Volume is low: only profile renders
 * (a sliver of traffic, and crawlers are challenged by Bot Protection),
 * and the keyspace is bounded by the number of distinct usernames.
 *
 * No-ops when Upstash isn't configured (local dev without creds).
 *
 * Caveat: counts *renders*, including tab navigation within a profile,
 * so the number is "times the profile area was rendered," not unique
 * humans.
 */

const COUNT_KEY = "profile-views:count";
const LAST_KEY = "profile-views:last";

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/**
 * Record one render of `name`'s profile. Fire-and-forget: returns
 * immediately; the caller must NOT await it (errors are swallowed so a
 * tracking hiccup can never affect the page).
 */
export function recordProfileView(name: string): void {
  if (!redis) return;
  const member = name.trim();
  if (!member) return;
  void (async () => {
    try {
      await redis.zincrby(COUNT_KEY, 1, member);
      await redis.hset(LAST_KEY, { [member]: Math.floor(Date.now() / 1000) });
    } catch {
      // best-effort telemetry — never surface
    }
  })();
}

/**
 * Most-viewed profiles, highest count first, each with its last-viewed
 * time. Returns `[]` on miss / Upstash-not-configured.
 */
export async function getMostViewedProfiles(
  limit = 100,
): Promise<ProfileViewRow[]> {
  if (!redis) return [];
  try {
    const raw = await redis.zrange<(string | number)[]>(
      COUNT_KEY,
      0,
      limit - 1,
      { rev: true, withScores: true },
    );
    const rows = parseScoredMembers(raw);
    if (rows.length === 0) return [];
    const lastMap =
      (await redis.hgetall<Record<string, string | number>>(LAST_KEY)) ?? {};
    return rows.map((r) => {
      const last = lastMap[r.name];
      return {
        ...r,
        lastViewedAt: last != null ? Number(last) : null,
      };
    });
  } catch {
    return [];
  }
}

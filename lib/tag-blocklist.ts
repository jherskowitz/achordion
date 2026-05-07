import "server-only";

import { cache } from "react";
import { Redis } from "@upstash/redis";

/**
 * Per-user blocklist for the MB tag voting / add-tag affordances.
 *
 * Tagging is open to every signed-in user by default — that's the
 * whole point of community-driven classification. But every open
 * vote system attracts the occasional bad actor (spammy tags,
 * coordinated downvote campaigns, slurs in custom tags). When that
 * happens we want to soft-block the user from posting new votes
 * without hiding the existing chips from anyone else.
 *
 * Storage: Upstash Redis set `tag:blocked:users` containing the
 * MusicBrainz usernames (case-sensitive) of blocked users. Members
 * are denied at the API layer; their existing votes on MB stay
 * untouched (we don't have authority to retract them).
 *
 * Admin ops (Upstash CLI):
 *   SADD    tag:blocked:users alice bob
 *   SREM    tag:blocked:users alice
 *   SMEMBERS tag:blocked:users
 *   DEL     tag:blocked:users        # clear everyone
 *
 * Env-var fallback (when Upstash isn't configured locally): set
 *   TAG_BLOCKLIST=alice,bob
 * Comma-separated MB usernames. Used in dev so we can test the
 * blocked-user code path without running Upstash.
 */

const REDIS_KEY = "tag:blocked:users";

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function envBlocklist(): Set<string> {
  const raw = process.env.TAG_BLOCKLIST;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Per-request memoized blocklist check. A single render that touches
 * tag voting (e.g. the Reviews + the add-tag flow on a long-lived
 * page) only hits Redis once; cross-request flips take effect
 * immediately on the next render.
 */
export const isTaggingBlocked = cache(
  async (mbUsername: string | null | undefined): Promise<boolean> => {
    if (!mbUsername) return false;
    if (redis) {
      const member = await redis
        .sismember(REDIS_KEY, mbUsername)
        .catch(() => 0);
      return member === 1;
    }
    return envBlocklist().has(mbUsername);
  },
);

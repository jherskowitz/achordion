import "server-only";

import { cache } from "react";
import { Redis } from "@upstash/redis";
import { auth } from "@/auth";

/**
 * Feature flags. Resolution order for `isFeatureEnabled(flag, user)`:
 *
 *   1. Redis `flag:<flag>:default` = "on"  → enabled for everyone
 *   2. Redis `flag:<flag>:default` = "off" → disabled for everyone (kill switch)
 *   3. Redis set  `flag:<flag>:users` contains the MusicBrainz username → enabled
 *   4. Default → disabled
 *
 * Env-var fallback (when Upstash isn't configured, e.g. local dev):
 *   - FEATURE_<FLAG>           = "on" | "off"               (mirrors :default)
 *   - FEATURE_<FLAG>_USERS     = comma-separated allowlist  (mirrors :users)
 *
 * Where `<FLAG>` is the flag name upper-cased with non-word chars → "_".
 *
 * Identity is the MusicBrainz username from the Auth.js session
 * (`session.user.mbUsername`). Logged-out users are never on the
 * allowlist, so they only see flags whose default is "on".
 *
 * Admin ops (using the Upstash CLI or any Redis client):
 *   redis> SADD  flag:reviews:users  alice  bob
 *   redis> SREM  flag:reviews:users  alice
 *   redis> SET   flag:reviews:default  on        # ship to everyone
 *   redis> SET   flag:reviews:default  off       # kill switch
 *   redis> DEL   flag:reviews:default            # back to allowlist mode
 */

const redis = (() => {
  // Accept either set of env-var names. The same Upstash Redis
  // backend is exposed via two Vercel integrations with different
  // conventions: the standalone "Upstash" Marketplace integration
  // sets `UPSTASH_REDIS_REST_URL` / `_TOKEN`; the "Vercel KV /
  // Storage" integration (which is also Upstash under the hood)
  // sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Reading both
  // means whichever integration the project was wired up with,
  // flags resolve from Redis without a manual rename.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function envKey(flag: string): string {
  return flag.toUpperCase().replace(/\W+/g, "_");
}

function envDefault(flag: string): "on" | "off" | null {
  const v = process.env[`FEATURE_${envKey(flag)}`]?.trim().toLowerCase();
  if (v === "on" || v === "off") return v;
  return null;
}

function envAllowlist(flag: string): Set<string> {
  const raw = process.env[`FEATURE_${envKey(flag)}_USERS`];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Per-request memoized so a single render checking the same flag
 * multiple times only hits Redis once. Not cached across requests —
 * we want flag flips to take effect immediately.
 */
export const isFeatureEnabled = cache(
  async (flag: string, user?: string | null): Promise<boolean> => {
    if (redis) {
      const def = await redis
        .get<string>(`flag:${flag}:default`)
        .catch(() => null);
      if (def === "on") return true;
      if (def === "off") return false;
      if (!user) return false;
      const member = await redis
        .sismember(`flag:${flag}:users`, user)
        .catch(() => 0);
      return member === 1;
    }

    const def = envDefault(flag);
    if (def === "on") return true;
    if (def === "off") return false;
    if (!user) return false;
    return envAllowlist(flag).has(user);
  },
);

/**
 * Resolve the flag for the currently signed-in user. Use this at the
 * top of a server component / page to decide whether to render a gated
 * surface.
 */
export async function isFeatureEnabledForViewer(flag: string): Promise<boolean> {
  const session = await auth();
  return isFeatureEnabled(flag, session?.user?.mbUsername ?? null);
}

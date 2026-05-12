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

/**
 * Static registry of flags the admin UI knows how to surface. New
 * flags should be added here when introduced — anything not listed
 * still works at runtime (the flag system is dynamic by name) but
 * won't appear in `/admin/flags`. Keep alphabetical for stable
 * render order.
 */
export interface FlagDefinition {
  id: string;
  /** Short label rendered next to the toggle. */
  label: string;
  /** One-sentence description of what the flag gates. */
  description: string;
}

export const KNOWN_FLAGS: ReadonlyArray<FlagDefinition> = [
  {
    id: "bsky-link",
    label: "Bluesky linking",
    description:
      "Profile-page Bluesky avatar / handle / bio overlay, /settings link UI, Find Bluesky Friends section, and bsky-friend-linked feed events.",
  },
  {
    id: "listener-bio",
    label: "Auto-generated listener bio",
    description:
      "Profile-page sentence composed from the user's recent listening data — top artists this month, play volume, streak. Fallback when the profile owner hasn't linked a Bluesky bio.",
  },
  {
    id: "listener-archetypes",
    label: "Listener archetype chips",
    description:
      "Profile-page personality chips computed from listening patterns — Night owl, Same-thing-on-repeat, Discoverer, etc. Independent of the auto-bio.",
  },
  {
    id: "listener-fingerprint",
    label: "Listener fingerprint",
    description:
      "Profile-page radial-bar SVG glyph derived from the user's top 24 artists — bar height = relative listen count, hue = artist-MBID hash. Visually distinctive per user; renders at thumbnail size on cards and full size on the profile header.",
  },
  {
    id: "listener-milestones",
    label: "Listener milestone chips",
    description:
      "Profile-page chips quantifying lifetime listening behaviour — total plays, distinct artists, current streak, listening-since year. Surfaces below the bio next to the archetype chips.",
  },
  {
    id: "mentions",
    label: "@username mentions in pin comments",
    description:
      "Parse `@username` tokens in pin blurbs and render them as profile links. Mentioned users see the pin in their /feed as a synthesised `mention` event and the unread badge counts it.",
  },
  {
    id: "reviews",
    label: "Album reviews",
    description:
      "CritiqueBrainz reviews + Wikipedia 'Critical reception' fallback on /release-group/<mbid>.",
  },
  {
    id: "write_reviews",
    label: "Write reviews",
    description:
      "Inline write-a-review form on the album page. Posts to CritiqueBrainz via the configured OAuth integration.",
  },
];

/**
 * Pull the per-flag state directly from Redis (or env fallback) so
 * the admin UI can render the current resolution without going
 * through the per-user `isFeatureEnabled` check. Returns `null`
 * when Upstash isn't configured and there's no env fallback —
 * caller renders an "unavailable" UI instead of guessing.
 */
export interface FlagState {
  /** Redis value at `flag:<id>:default`. `"on"` | `"off"` | null. */
  defaultValue: "on" | "off" | null;
  /** Members of `flag:<id>:users`. Empty when no allowlist is set. */
  users: string[];
}

export async function getFlagState(flag: string): Promise<FlagState | null> {
  if (redis) {
    const def = await redis
      .get<string>(`flag:${flag}:default`)
      .catch(() => null);
    const users = await redis
      .smembers(`flag:${flag}:users`)
      .catch(() => [] as string[]);
    return {
      defaultValue: def === "on" ? "on" : def === "off" ? "off" : null,
      users,
    };
  }
  const envDef = envDefault(flag);
  const envUsers = Array.from(envAllowlist(flag));
  if (envDef === null && envUsers.length === 0) return null;
  return { defaultValue: envDef, users: envUsers };
}

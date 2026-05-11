import "server-only";

import { Redis } from "@upstash/redis";
import { unstable_cache } from "next/cache";
import { getActiveAnnouncementsFor } from "@/lib/announcements";
import { KNOWN_FLAGS, getFlagState, type FlagState } from "@/lib/flags";

/**
 * Admin-only counts pulled out of Upstash.
 *
 * Each count is one `SCAN` walk over a key pattern. SCAN is the
 * right tool here (KEYS would block Upstash and lock real
 * traffic); the cursor loop runs in batches of 1000 and returns
 * just the totals — no key strings retained.
 *
 * Wrapped in `unstable_cache` with a 5-minute revalidate so admin
 * page refreshes don't hammer Upstash. The numbers don't change
 * fast enough for staler-than-5min readings to mislead.
 */

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/**
 * Count every key matching `match` while excluding any whose name
 * matches one of `excludeMatches`. Returns the inclusive count.
 *
 * Implemented client-side over SCAN because Upstash's REST SCAN
 * doesn't accept compound patterns; we ask for the broad match
 * and post-filter the cursor batches.
 */
async function countMatching(
  r: Redis,
  match: string,
  excludeMatches: string[] = [],
): Promise<number> {
  let cursor = "0";
  let total = 0;
  const excludeRegexes = excludeMatches.map(globToRegex);
  do {
    // `scan` returns [nextCursor, keys]. Upstash typings vary by
    // version; cast to a known tuple shape here so the loop is
    // unambiguous regardless of upstream type drift.
    const result = (await r.scan(cursor, { match, count: 1000 })) as unknown as [
      string,
      string[],
    ];
    const [next, batch] = result;
    for (const key of batch) {
      if (excludeRegexes.some((re) => re.test(key))) continue;
      total++;
    }
    cursor = next;
  } while (cursor !== "0");
  return total;
}

/** Convert a Redis glob (`prefix:*`) to a JS regex. SCAN globs we
 *  use here are flat prefixes; full glob semantics aren't needed. */
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

export interface AdminStats {
  /** Users who have linked their Bluesky account via /settings. */
  bskyLinkedUsers: number;
  /** Distinct recordings with at least one cached external streaming link. */
  recordingLinks: number;
  /** Distinct release-groups (albums) with at least one cached external link. */
  releaseGroupLinks: number;
  /** Track-link entries grouped by which source supplied at least one
   *  link. A single recording can sit in multiple buckets (e.g. an
   *  Odesli-resolved track that Parachord later played + confirmed),
   *  so these don't sum to `recordingLinks`. */
  trackLinkSources: {
    parachord: number;
    odesli: number;
    mb: number;
  };
  /** Count of announcement banners currently surfaced site-wide on
   *  Achordion (`surfaces` omitted or includes "achordion", non-
   *  expired). 0 means no banner is up. */
  activeAnnouncements: number;
  /** Per-known-flag rollout state. Renders the at-a-glance "what's
   *  shipped to whom right now" strip on the admin index. */
  flagRollouts: Array<{
    id: string;
    label: string;
    state: FlagState | null;
  }>;
  /** Server-side `Date.now()` at compute time — admin UI uses this
   *  to show a "Last computed Xm ago" footer so a viewer can tell
   *  fresh numbers from cached ones (cache is 5min). */
  computedAt: number;
  /** Upstash unreachable at this read — admin UI surfaces an unavailable banner instead of zeros. */
  unavailable: boolean;
}

/** Walk every cached track-link entry once, batch via MGET, and
 *  tally how many entries have at least one link from each source.
 *  Sources overlap per entry (the same recording can carry links
 *  from multiple resolvers), so buckets are independent, not
 *  partitioned.
 *
 *  Expensive on a cold cache — 12k entries × ~50ms per 100-key MGET
 *  = ~6s wall time. Wrapped in the outer 5-min `unstable_cache` so
 *  the admin UI hits this path at most once every five minutes. */
async function tallyTrackLinkSources(
  r: Redis,
): Promise<AdminStats["trackLinkSources"]> {
  const out = { parachord: 0, odesli: 0, mb: 0 };
  let cursor = "0";
  const RECORD_PREFIX = "track-links:";
  // Exclude the release-group + isrc shapes — only count recording
  // entries, which use the bare `track-links:<mbid>` shape.
  const EXCLUDE = [
    globToRegex("track-links:release-group:*"),
    globToRegex("track-links:isrc:*"),
  ];
  do {
    const result = (await r.scan(cursor, {
      match: `${RECORD_PREFIX}*`,
      count: 1000,
    })) as unknown as [string, string[]];
    const [next, batch] = result;
    cursor = next;
    const recordingKeys = batch.filter(
      (k) => !EXCLUDE.some((re) => re.test(k)),
    );
    if (recordingKeys.length === 0) continue;
    // MGET batches of up to 100 keys. Upstash's REST endpoint
    // tolerates larger but smaller batches keep tail latency
    // predictable.
    for (let i = 0; i < recordingKeys.length; i += 100) {
      const slice = recordingKeys.slice(i, i + 100);
      const values = (await r.mget<(unknown | null)[]>(...slice)) ?? [];
      for (const v of values) {
        if (!v) continue;
        const parsed = typeof v === "string" ? safeJsonParse(v) : v;
        const links =
          parsed && typeof parsed === "object" && "links" in parsed
            ? (parsed as { links?: Array<{ source?: string }> }).links
            : undefined;
        if (!Array.isArray(links)) continue;
        const sources = new Set(links.map((l) => l.source));
        if (sources.has("parachord")) out.parachord++;
        if (sources.has("odesli")) out.odesli++;
        if (sources.has("mb")) out.mb++;
      }
    }
  } while (cursor !== "0");
  return out;
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const EMPTY_STATS: AdminStats = {
  bskyLinkedUsers: 0,
  recordingLinks: 0,
  releaseGroupLinks: 0,
  trackLinkSources: { parachord: 0, odesli: 0, mb: 0 },
  activeAnnouncements: 0,
  flagRollouts: [],
  computedAt: 0,
  unavailable: true,
};

async function computeAdminStats(): Promise<AdminStats> {
  if (!redis) return { ...EMPTY_STATS, computedAt: Date.now() };
  try {
    // All Upstash reads in parallel — independent SCAN walks +
    // independent helper fetches. Wall time = the slowest one.
    const [
      bskyLinkedUsers,
      recordingLinks,
      releaseGroupLinks,
      trackLinkSources,
      announcements,
      flagStates,
    ] = await Promise.all([
      // `bsky-link:*` includes the `bsky-link-by-did:*` reverse
      // index — filter it out so the count is one per user.
      countMatching(redis, "bsky-link:*", ["bsky-link-by-did:*"]),
      countMatching(redis, "track-links:*", [
        "track-links:release-group:*",
        "track-links:isrc:*",
      ]),
      countMatching(redis, "track-links:release-group:*"),
      tallyTrackLinkSources(redis),
      getActiveAnnouncementsFor("achordion"),
      Promise.all(
        KNOWN_FLAGS.map(async (f) => ({
          id: f.id,
          label: f.label,
          state: await getFlagState(f.id),
        })),
      ),
    ]);
    return {
      bskyLinkedUsers,
      recordingLinks,
      releaseGroupLinks,
      trackLinkSources,
      activeAnnouncements: announcements.length,
      flagRollouts: flagStates,
      computedAt: Date.now(),
      unavailable: false,
    };
  } catch {
    return { ...EMPTY_STATS, computedAt: Date.now() };
  }
}

export const getAdminStats = unstable_cache(
  computeAdminStats,
  // v2 — schema gained trackLinkSources, activeAnnouncements,
  // flagRollouts, computedAt. v1 entries are missing those fields
  // and would render as zeros / undefined.
  ["admin-stats-v2"],
  {
    revalidate: 300,
    tags: ["admin-stats"],
  },
);

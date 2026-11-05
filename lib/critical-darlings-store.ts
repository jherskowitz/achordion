import "server-only";

import { Redis } from "@upstash/redis";
import { unstable_cache } from "next/cache";
import type { CriticsPickAlbum } from "@/lib/clients/critical-darlings";

/**
 * Webhook-fed store for Critical Darlings.
 *
 * Replaces the RSSground-hosted RSS feed the surface used to poll.
 * IFTTT (which still does the Metacritic scrape + score>80 filter +
 * AI summary + Spotify lookup) POSTs each new high-scored album to
 * `/api/critical-darlings/ingest`, which appends it here. The surface
 * (`getCriticalDarlings`) reads this store first and only falls back
 * to the legacy feed while the store is still empty.
 *
 * Single Upstash row keyed `critical-darlings:json` holding a JSON
 * array — same shape as the announcements store. IFTTT fires one POST
 * per new feed item, so ingest is an append/upsert (dedup by `id`,
 * newest-first, capped, age-pruned) rather than a full replace.
 *
 * Admin peek / reset via the Upstash console:
 *     redis> GET critical-darlings:json
 *     redis> DEL critical-darlings:json   # clear the surface
 */

export const CRITICAL_DARLINGS_KEY = "critical-darlings:json";

/** First-seen timestamps for Metacritic source-feed items (guid → ms). */
const FEED_FIRSTSEEN_KEY = "critical-darlings:feed-firstseen";

/** Keep the surface to a sane rolling window. */
const MAX_ITEMS = 60;
/** Drop anything older than this on read + write, even without churn. */
const MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000;

/** Stored shape = the render shape plus the server-set ingest time. */
export type StoredCriticalDarling = CriticsPickAlbum & { ingestedAt: number };

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/** Coerce whatever Upstash hands back (object or JSON string) into an array. */
function coerceArray(value: unknown): StoredCriticalDarling[] {
  if (!value) return [];
  let arr: unknown = value;
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (d): d is StoredCriticalDarling =>
      !!d &&
      typeof d === "object" &&
      typeof (d as StoredCriticalDarling).id === "string" &&
      typeof (d as StoredCriticalDarling).ingestedAt === "number",
  );
}

/**
 * Read the stored picks, newest-first, age-pruned and capped.
 *
 * Wrapped in `unstable_cache` (tagged `critical-darlings`) so the raw
 * Upstash read doesn't flip the ISR-cached `/explore/critical-darlings`
 * page to dynamic — a dynamic render would re-fire ~30 rate-limited
 * MusicBrainz cover lookups on every visit. The ingest route busts the
 * tag, so a new pick still appears on the next visit. Same pattern as
 * `loadAllAnnouncements`.
 */
const readStoredCriticalDarlings = unstable_cache(
  async (): Promise<CriticsPickAlbum[]> => {
    if (!redis) return [];
    const raw = await redis
      .get<StoredCriticalDarling[] | string>(CRITICAL_DARLINGS_KEY)
      .catch(() => null);
    const now = Date.now();
    return coerceArray(raw)
      .filter((d) => now - d.ingestedAt < MAX_AGE_MS)
      .sort((a, b) => b.ingestedAt - a.ingestedAt)
      .slice(0, MAX_ITEMS)
      .map((d) => ({
        id: d.id,
        title: d.title,
        artist: d.artist,
        link: d.link,
        description: d.description,
        spotifyUrl: d.spotifyUrl,
        pubDate: d.pubDate,
        score: d.score,
      }));
  },
  ["critical-darlings-store"],
  { revalidate: 60 * 60 * 12, tags: ["critical-darlings"] },
);

/**
 * Returns `[]` when Upstash isn't configured (local dev) or the row is
 * empty — the caller falls back to the legacy feed in that case.
 */
export async function getStoredCriticalDarlings(): Promise<CriticsPickAlbum[]> {
  return readStoredCriticalDarlings();
}

/**
 * Upsert a batch of picks (IFTTT sends one at a time; a future batch
 * producer can send many). Incoming items win over existing ones with
 * the same `id`, so a re-scrape refreshes the score / summary. Returns
 * the number of items accepted. No-op returning 0 when Upstash isn't
 * configured.
 */
export async function ingestCriticalDarlings(
  incoming: StoredCriticalDarling[],
): Promise<number> {
  if (!redis || incoming.length === 0) return 0;

  const raw = await redis
    .get<StoredCriticalDarling[] | string>(CRITICAL_DARLINGS_KEY)
    .catch(() => null);

  const byId = new Map<string, StoredCriticalDarling>();
  for (const d of coerceArray(raw)) byId.set(d.id, d);
  for (const d of incoming) byId.set(d.id, d); // fresh scrape wins

  const now = Date.now();
  const merged = Array.from(byId.values())
    .filter((d) => now - d.ingestedAt < MAX_AGE_MS)
    .sort((a, b) => b.ingestedAt - a.ingestedAt)
    .slice(0, MAX_ITEMS);

  await redis.set(CRITICAL_DARLINGS_KEY, JSON.stringify(merged));
  return incoming.length;
}

/**
 * Resolve a stable first-seen timestamp (ms) for each source-feed item,
 * keyed by its guid (the album URL). Used as the `<pubDate>` in the
 * Metacritic source feed: a newly-appearing album is stamped `now` (so it
 * reads as recent and IFTTT's RSS trigger fires on it), and that timestamp
 * then STAYS PUT as the item persists across regenerations — instead of
 * re-stamping "now" every render, which made the dates meaningless.
 *
 * Call with the guids currently in the feed. Unseen guids are stamped now,
 * known guids keep their stored timestamp, and guids no longer present are
 * pruned so the map stays bounded to the current feed. The write only fires
 * when the set actually changed. Fail-open: returns `now` for every guid
 * when Upstash isn't configured or errors, so the feed still emits a recent
 * (if non-persistent) date.
 */
export async function getFeedFirstSeen(
  guids: string[],
): Promise<Map<string, number>> {
  const now = Date.now();
  const allNow = (): Map<string, number> =>
    new Map(guids.map((g): [string, number] => [g, now]));
  if (!redis || guids.length === 0) return allNow();

  let stored: Record<string, number> = {};
  try {
    const raw = await redis.get<Record<string, number> | string>(
      FEED_FIRSTSEEN_KEY,
    );
    if (typeof raw === "string") {
      try {
        stored = JSON.parse(raw) as Record<string, number>;
      } catch {
        stored = {};
      }
    } else if (raw && typeof raw === "object") {
      stored = raw;
    }
  } catch {
    return allNow(); // fail-open
  }

  const current = new Set(guids);
  const next: Record<string, number> = {};
  for (const g of guids) {
    next[g] = typeof stored[g] === "number" ? stored[g] : now;
  }
  const changed =
    guids.some((g) => typeof stored[g] !== "number") || // a new guid
    Object.keys(stored).some((k) => !current.has(k)); // a pruned guid
  if (changed) {
    try {
      await redis.set(FEED_FIRSTSEEN_KEY, JSON.stringify(next));
    } catch {
      // Best-effort — the map returned is still correct for this render.
    }
  }
  return new Map<string, number>(Object.entries(next));
}

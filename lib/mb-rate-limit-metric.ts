import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Lightweight, fail-open counter for user-impacting MusicBrainz 429s —
 * the rate-limit errors that (post-`mbFetch` retry) surface as the
 * MB_RATE_LIMITED error page. `mbFetch` is otherwise silent about them,
 * so this is the "keep an eye on the rate-limiting" signal: a per-day
 * tally readable on /admin to decide whether the MB pressure from the
 * chart pages' track-cover fan-out warrants a deeper mitigation.
 *
 * Written only on the (rare) terminal-429 path, never on the hot path,
 * and never awaited — telemetry must never add latency to, or fail, a
 * request. Reads/writes no-op without Upstash creds (local dev).
 */
const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

const TTL_SECONDS = 60 * 60 * 24 * 21; // 21 days — covers the 7-day view
const key = (day: string) => `mb:429:${day}`;
const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/**
 * Record one user-impacting MB 429. Fire-and-forget; never throws.
 */
export function recordMbRateLimit(): void {
  if (!redis) return;
  const k = key(dayOf(Date.now()));
  void (async () => {
    try {
      await redis.incr(k);
      await redis.expire(k, TTL_SECONDS);
    } catch {
      /* fail-open: a dropped telemetry write is fine */
    }
  })();
}

export interface MbRateLimitStats {
  today: number;
  last7d: number;
  /** Most-recent day first, 7 entries. */
  byDay: { date: string; count: number }[];
}

/**
 * Read the last 7 days of MB-429 counts. Not cached (callers want a
 * current number); a single mget. Returns zeros on any failure / no Redis.
 */
export async function getMbRateLimitStats(): Promise<MbRateLimitStats> {
  if (!redis) return { today: 0, last7d: 0, byDay: [] };
  try {
    const days = Array.from({ length: 7 }, (_, i) =>
      dayOf(Date.now() - i * 24 * 60 * 60 * 1000),
    );
    const vals = await redis.mget<(number | null)[]>(...days.map(key));
    const byDay = days.map((date, i) => ({
      date,
      count: Number(vals?.[i] ?? 0),
    }));
    return {
      today: byDay[0]?.count ?? 0,
      last7d: byDay.reduce((sum, d) => sum + d.count, 0),
      byDay,
    };
  } catch {
    return { today: 0, last7d: 0, byDay: [] };
  }
}

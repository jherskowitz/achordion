import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-IP rate limiting for our public API routes.
 *
 * Distinct from `lib/clients/musicbrainz.ts`'s outbound limiter (which
 * caps how fast WE talk to MB). This one caps how fast a single
 * incoming IP can hit our endpoints — last line of defense against a
 * crawler that ignores robots.txt and slips past the edge UA filter.
 *
 * Sliding-window 60/min/IP is generous enough that a real user
 * scrolling a chart with 30 lazy cover-art tiles never sees a 429
 * (those fire in parallel and resolve in a couple of seconds), but
 * tight enough that a crawler walking 1,000 entities at full tilt
 * gets cut off at the knees within the first minute.
 *
 * Returns `null` when Upstash env vars aren't set (local dev) — the
 * caller should treat null as "no limiter, let the request through."
 */
function makeLimiter(prefix: string, limit: number, window: `${number} ${"s" | "m" | "h"}`) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix,
    // Don't have the limiter wait — we want a fast 429 so callers
    // can fall back, not a stalled connection.
    analytics: false,
  });
}

const coverLimiter = makeLimiter("ip:cover", 60, "60 s");
const imageLimiter = makeLimiter("ip:image", 60, "60 s");
// Page-route limiter has to be generous: a real user opening a tab
// triggers the page request itself + N RSC prefetches for hovered
// links + N async API XHRs (reviews, social-proof, tags, etc.), so
// 120/min (≈ 2/sec) trips on routine multi-tab browsing or a fast
// reload-test loop. 600/min keeps the catalog-walker cutoff intact
// (a 1k-entity scrape still hits the wall in <2 minutes) while
// leaving plenty of headroom for legitimate per-user activity.
const pageLimiter = makeLimiter("ip:page", 600, "60 s");

/**
 * Client-IP extraction for rate-limit keying. Hardened against
 * spoofing.
 *
 * **Why we don't read `X-Forwarded-For`'s leftmost value.** XFF is
 * appended to by every hop on the way in. The leftmost entry is whatever
 * the *original client* set — which means a hostile client can write
 * `X-Forwarded-For: <random>` and bypass the limiter on every request.
 * On Vercel the trusted source is the platform-injected `x-real-ip`
 * header; fall back to the rightmost XFF entry (the closest trusted
 * hop) when `x-real-ip` is missing (local dev, non-Vercel runtime).
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    // Rightmost entry = closest trusted hop. Defensive even on non-
    // Vercel runtimes where this is best-effort either way.
    const parts = fwd.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return "unknown";
}

/**
 * Check the per-IP limit for a route. Returns `{ ok: true }` when the
 * request is allowed (or when no limiter is configured); `{ ok: false }`
 * when the IP is over its budget.
 */
export async function checkRateLimit(
  kind: "cover" | "image" | "page",
  request: Request,
): Promise<{ ok: boolean }> {
  const limiter =
    kind === "cover"
      ? coverLimiter
      : kind === "image"
        ? imageLimiter
        : pageLimiter;
  if (!limiter) return { ok: true };
  const ip = getClientIp(request);
  const result = await limiter.limit(ip);
  return { ok: result.success };
}

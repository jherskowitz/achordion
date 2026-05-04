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
// Page-route limiter is roomier than the API ones — a real user can
// open 4-5 tabs in quick succession and we don't want to 429 them.
// 120/min cuts off a crawler walking the catalog at full tilt within
// the first minute, which is the actual goal.
const pageLimiter = makeLimiter("ip:page", 120, "60 s");

/** Best-effort client-IP extraction from forwarded headers. */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
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

import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Engagement telemetry for in-app announcements.
 *
 * Parachord clients POST one of three events when a banner surfaces:
 *
 *   - `view`       — banner first painted to the user this session
 *   - `dismiss`    — user clicked the × on the banner
 *   - `cta-click`  — user clicked the optional CTA button
 *
 * Storage: a Redis hash per announcement id, with one field per event
 * type holding the integer count.
 *
 *   ann:event:<id> = { view: N, dismiss: M, cta-click: K }
 *
 * Read counters in the Upstash Data Browser (or `HGETALL ann:event:<id>`)
 * — there's no admin UI on Achordion's side yet. If you wire one up
 * later, it should still read straight from these hashes.
 *
 * Auth: unauthenticated, per-IP rate-limited at 60/min/IP. The endpoint
 * accepts only known events for known shapes; anyone hitting it can
 * inflate counters for *any* id, but the bound is the rate limit times
 * however many IPs they have. Acceptable for a banner-engagement counter
 * — bump the limiter or add a HMAC signature if that ever feels too
 * loose.
 *
 * No PII is captured. The IP is read for rate-limiting only and never
 * persisted. We don't tag events with build version, OS, or any client
 * identifier — events are anonymous and unattributable to an install.
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

const EVENTS = ["view", "dismiss", "cta-click"] as const;
type EventName = (typeof EVENTS)[number];

const BodySchema = z.object({
  // Match the announcement id constraint from the read schema. Tighter
  // here so a malformed id can't poison the keyspace.
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9._-]+$/),
  event: z.enum(EVENTS),
});

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function counterKey(id: string): string {
  return `ann:event:${id}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limit = await checkRateLimit("announcement-event", request);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid event", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  // No Redis configured (local dev without Upstash) — accept silently
  // so the desktop client doesn't get errors during development. The
  // event is dropped on the floor, which is the right behaviour for a
  // best-effort telemetry path.
  if (!redis) {
    return NextResponse.json({ ok: true, recorded: false }, { headers: NO_STORE });
  }

  const { id, event } = parsed.data;
  try {
    const count = await redis.hincrby(counterKey(id), event, 1);
    return NextResponse.json(
      { ok: true, recorded: true, count },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.warn("[announcements/event] hincrby failed:", err);
    // Don't surface the error to clients — telemetry is best-effort.
    return NextResponse.json(
      { ok: true, recorded: false },
      { headers: NO_STORE },
    );
  }
}

/**
 * Read counters for an announcement id. Optional convenience endpoint;
 * the canonical lookup is `HGETALL ann:event:<id>` in Upstash. Unauth'd
 * since the data is just aggregate counts — nothing user-identifying.
 *
 *   GET /api/announcements/event?id=<id>
 *     → { id, view: N, dismiss: M, "cta-click": K }
 *
 * Counters absent from Redis are returned as 0 so callers don't have
 * to handle missing fields.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const limit = await checkRateLimit("announcement-event", request);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const idParam = url.searchParams.get("id") ?? "";
  const idCheck = BodySchema.shape.id.safeParse(idParam);
  if (!idCheck.success) {
    return NextResponse.json(
      { error: "invalid id" },
      { status: 400, headers: NO_STORE },
    );
  }
  const id = idCheck.data;

  if (!redis) {
    return NextResponse.json(
      { id, view: 0, dismiss: 0, "cta-click": 0 },
      { headers: NO_STORE },
    );
  }

  try {
    const raw = (await redis.hgetall<Record<EventName, string | number>>(
      counterKey(id),
    )) ?? ({} as Record<EventName, string | number>);
    const out: Record<string, number | string> = { id };
    for (const e of EVENTS) {
      const v = raw[e];
      out[e] = typeof v === "number" ? v : v ? parseInt(String(v), 10) || 0 : 0;
    }
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (err) {
    console.warn("[announcements/event] hgetall failed:", err);
    return NextResponse.json(
      { id, view: 0, dismiss: 0, "cta-click": 0 },
      { headers: NO_STORE },
    );
  }
}

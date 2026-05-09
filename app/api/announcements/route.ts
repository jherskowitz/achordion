import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { z } from "zod";

/**
 * Public announcements feed.
 *
 * Used by Parachord-desktop (and any other Parachord client that
 * adopts the same shape) to render in-app banner notifications. The
 * endpoint is intentionally **unauthenticated**: announcements are
 * broadcasts to every install, and gating them behind a token would
 * just be ceremony — the URL is hardcoded in the desktop binary, not
 * user-typed.
 *
 * Storage: a single Redis key `announcements:json` holding the JSON
 * array. Edit it via the Upstash console or CLI:
 *
 *     redis> SET announcements:json '[{"id":"...","title":"..."}]'
 *     redis> DEL announcements:json   # clears the banner everywhere
 *
 * Env-var fallback for local dev (when Upstash isn't configured):
 *     ANNOUNCEMENTS_JSON='[{"id":"...","title":"..."}]'
 *
 * Cache: `s-maxage=60, stale-while-revalidate=600`. Edits propagate
 * to clients within ~60s worst case while keeping reads at zero
 * origin cost in steady state. Tighten the TTLs if you ever want a
 * push-style "this is urgent, show now" lever.
 *
 * Schema (matches the desktop validator in parachord-desktop/main.js):
 *     id          string, required, stable     (dismissals key off this)
 *     title       string, required
 *     severity    'info' | 'success' | 'warn' | 'error'  (default 'info')
 *     body        string, optional
 *     icon        string ≤4 chars, optional    (emoji / glyph)
 *     iconUrl     https URL, optional          (small image, 20×20)
 *     cta         { label: string, url: http(s) URL }, optional
 *     minVersion  semver string, optional      (inclusive lower bound)
 *     maxVersion  semver string, optional      (inclusive upper bound)
 *     expiresAt   ISO-8601 string, optional    (filtered out client-side)
 *
 * Malformed entries are dropped silently; well-formed entries still
 * render. Clients also re-validate on receipt.
 */

export const dynamic = "force-dynamic";

const ANNOUNCEMENTS_KEY = "announcements:json";
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_ITEMS = 20;

const AnnouncementSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  severity: z.enum(["info", "success", "warn", "error"]).optional(),
  body: z.string().optional(),
  icon: z.string().max(4).optional(),
  iconUrl: z.string().regex(/^https:\/\//i).optional(),
  cta: z
    .object({
      label: z.string().min(1),
      url: z.string().regex(/^https?:\/\//i),
    })
    .optional(),
  minVersion: z.string().optional(),
  maxVersion: z.string().optional(),
  expiresAt: z.string().optional(),
});

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

async function loadRaw(): Promise<string | null> {
  if (redis) {
    const value = await redis.get<string>(ANNOUNCEMENTS_KEY).catch(() => null);
    if (typeof value === "string") return value;
    // Upstash sometimes returns parsed objects when the stored value happens
    // to be valid JSON; re-stringify so the downstream parse path is uniform.
    if (value && typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    }
  }
  return process.env.ANNOUNCEMENTS_JSON ?? null;
}

function parseItems(raw: string | null): unknown[] {
  if (!raw) return [];
  if (raw.length > MAX_PAYLOAD_BYTES) {
    console.warn(
      `[announcements] payload exceeds ${MAX_PAYLOAD_BYTES} bytes (${raw.length}); ignored`,
    );
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[announcements] invalid JSON in store:", err);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn("[announcements] store value is not an array");
    return [];
  }
  return parsed;
}

function validateItems(items: unknown[]): z.infer<typeof AnnouncementSchema>[] {
  const out: z.infer<typeof AnnouncementSchema>[] = [];
  let dropped = 0;
  for (const item of items) {
    const result = AnnouncementSchema.safeParse(item);
    if (result.success) out.push(result.data);
    else dropped++;
    if (out.length >= MAX_ITEMS) break;
  }
  if (dropped > 0) {
    console.warn(`[announcements] dropped ${dropped} malformed entr${dropped === 1 ? "y" : "ies"}`);
  }
  return out;
}

export async function GET(): Promise<NextResponse> {
  const raw = await loadRaw();
  const items = validateItems(parseItems(raw));
  return NextResponse.json(items, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

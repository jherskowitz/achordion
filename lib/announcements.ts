import "server-only";

import { Redis } from "@upstash/redis";
import { unstable_cache } from "next/cache";
import { z } from "zod";

/**
 * Shared announcement store.
 *
 * Backs both `/api/announcements` (consumed by Parachord-desktop's
 * in-app banner) and Achordion's own site-wide banner. Single
 * Upstash row keyed `announcements:json`; admin edits via the
 * Upstash console:
 *
 *     redis> SET announcements:json '[{"id":"...","title":"..."}]'
 *     redis> DEL announcements:json   # clears every banner
 *
 * Each item can optionally scope itself to a subset of surfaces via
 * `surfaces`. When omitted, the item shows on every surface — the
 * pre-`surfaces` default, so existing entries keep working.
 *
 * Env-var fallback for local dev:
 *     ANNOUNCEMENTS_JSON='[{"id":"...","title":"..."}]'
 *
 * Schema (clients re-validate on receipt):
 *     id          string, required, stable           (dismissals key off this)
 *     title       string, required
 *     severity    'info' | 'success' | 'warn' | 'error'   (default 'info')
 *     body        string, optional
 *     icon        string ≤4 chars, optional          (emoji / glyph)
 *     iconUrl     https URL, optional                (small image, 20×20)
 *     cta         { label: string, url: http(s) URL }, optional
 *     surfaces    ('achordion' | 'parachord')[], optional, default both
 *     minVersion  semver string, optional            (parachord only)
 *     maxVersion  semver string, optional            (parachord only)
 *     expiresAt   ISO-8601 string, optional          (filtered out client-side)
 *
 * Malformed entries are dropped silently.
 */

export const ANNOUNCEMENTS_KEY = "announcements:json";
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_ITEMS = 20;

export const SurfaceSchema = z.enum(["achordion", "parachord"]);
export type AnnouncementSurface = z.infer<typeof SurfaceSchema>;

export const AnnouncementSchema = z.object({
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
  surfaces: z.array(SurfaceSchema).optional(),
  minVersion: z.string().optional(),
  maxVersion: z.string().optional(),
  expiresAt: z.string().optional(),
});

export type Announcement = z.infer<typeof AnnouncementSchema>;

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
    // Upstash sometimes returns parsed objects when the stored value
    // happens to be valid JSON; re-stringify so the downstream parse
    // path is uniform across both shapes.
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

function validateItems(items: unknown[]): Announcement[] {
  const out: Announcement[] = [];
  let dropped = 0;
  for (const item of items) {
    const result = AnnouncementSchema.safeParse(item);
    if (result.success) out.push(result.data);
    else dropped++;
    if (out.length >= MAX_ITEMS) break;
  }
  if (dropped > 0) {
    console.warn(
      `[announcements] dropped ${dropped} malformed entr${dropped === 1 ? "y" : "ies"}`,
    );
  }
  return out;
}

/**
 * Load every announcement in the store, regardless of surface or
 * expiry. The /api/announcements route hands the full set to
 * Parachord-desktop (which then filters by its own version + the
 * desktop platform). Surface-specific consumers should use the
 * helpers below.
 *
 * Wrapped in `unstable_cache` so server components mounting the
 * banner in route-group layouts don't flip every page dynamic.
 * 60s TTL matches the `s-maxage=60` the public /api/announcements
 * route already advertises — admin edits propagate to users
 * within ~1 minute regardless of which surface picks them up.
 */
export const loadAllAnnouncements = unstable_cache(
  async (): Promise<Announcement[]> => {
    const raw = await loadRaw();
    return validateItems(parseItems(raw));
  },
  ["announcements:all"],
  { revalidate: 60, tags: ["announcements"] },
);

/**
 * Default surface assumption: items without an explicit `surfaces`
 * field render on every surface. Lets older entries (written before
 * the surface scoping was added) keep their existing reach without
 * a migration step.
 */
function isForSurface(
  item: Announcement,
  surface: AnnouncementSurface,
): boolean {
  if (!item.surfaces || item.surfaces.length === 0) return true;
  return item.surfaces.includes(surface);
}

function isExpired(item: Announcement, nowMs: number): boolean {
  if (!item.expiresAt) return false;
  const t = Date.parse(item.expiresAt);
  if (Number.isNaN(t)) return false;
  return t < nowMs;
}

/**
 * Active (non-expired) announcements scoped to a specific surface.
 * Used by Achordion's banner; Parachord-desktop still hits the raw
 * route handler so it can do its own minVersion/maxVersion filter.
 */
export async function getActiveAnnouncementsFor(
  surface: AnnouncementSurface,
): Promise<Announcement[]> {
  const items = await loadAllAnnouncements();
  const now = Date.now();
  return items.filter(
    (a) => isForSurface(a, surface) && !isExpired(a, now),
  );
}

"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { AnnouncementSchema, ANNOUNCEMENTS_KEY } from "@/lib/announcements";

/**
 * Admin write surface for feature flags + announcements.
 *
 * Every action gates with `requireAdmin()` (throws on miss — Next's
 * action error boundary renders the message). Reads happen in the
 * page components; mutations come back here so writes stay
 * server-side.
 *
 * Why re-create the Redis client per file instead of importing a
 * shared one: keeps each module's failure modes co-located with
 * its own code, and avoids accidentally exposing the write client
 * via a side-effect import.
 */

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function requireRedis(): Redis {
  if (!redis) {
    throw new Error(
      "Upstash isn't configured — set UPSTASH_REDIS_REST_URL + _TOKEN (or the KV_REST_API_* pair).",
    );
  }
  return redis;
}

// ─── Feature flags ──────────────────────────────────────────────────

const FlagIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  // Same shape we use as Redis keys. Whitelist instead of escaping —
  // there's no legitimate reason for a flag id to need anything more
  // exotic than [a-z0-9_-].
  .regex(/^[a-z0-9_-]+$/i, "Flag IDs are [a-z0-9_-]+ only.");

const MbUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  // MB usernames are at least case-tolerant; we lower-case on
  // resolution. Keep the same regex shape as the flag id.
  .regex(/^[a-z0-9_-]+$/i, "Usernames are [a-z0-9_-]+ only.");

export async function setFlagDefault(
  flagId: string,
  value: "on" | "off" | "clear",
): Promise<void> {
  await requireAdmin();
  const id = FlagIdSchema.parse(flagId);
  const r = requireRedis();
  const key = `flag:${id}:default`;
  if (value === "clear") {
    await r.del(key);
  } else {
    await r.set(key, value);
  }
  revalidatePath("/admin/flags");
}

export async function addFlagUser(
  flagId: string,
  rawUsername: string,
): Promise<void> {
  await requireAdmin();
  const id = FlagIdSchema.parse(flagId);
  const username = MbUsernameSchema.parse(rawUsername);
  const r = requireRedis();
  await r.sadd(`flag:${id}:users`, username);
  revalidatePath("/admin/flags");
}

export async function removeFlagUser(
  flagId: string,
  rawUsername: string,
): Promise<void> {
  await requireAdmin();
  const id = FlagIdSchema.parse(flagId);
  const username = MbUsernameSchema.parse(rawUsername);
  const r = requireRedis();
  await r.srem(`flag:${id}:users`, username);
  revalidatePath("/admin/flags");
}

// ─── Announcements ──────────────────────────────────────────────────

/**
 * Replace the entire `announcements:json` array. The admin UI hands
 * back the full edited list (add / edit / delete are all client-
 * side until the user clicks Save), then we validate via the same
 * `AnnouncementSchema` /api/announcements uses on read and write
 * the result. Schema mismatch → action throws, UI surfaces the
 * Zod error.
 */
const AnnouncementsArraySchema = z.array(AnnouncementSchema).max(20);

export async function saveAnnouncements(items: unknown): Promise<void> {
  await requireAdmin();
  const validated = AnnouncementsArraySchema.parse(items);
  const r = requireRedis();
  if (validated.length === 0) {
    await r.del(ANNOUNCEMENTS_KEY);
  } else {
    await r.set(ANNOUNCEMENTS_KEY, JSON.stringify(validated));
  }
  // Bust three caching layers so admin edits surface immediately:
  //   1. The in-process `unstable_cache` slot in lib/announcements.ts
  //      (server-component re-renders read fresh from Redis).
  //   2. The /api/announcements route's CDN cache (Parachord-desktop
  //      polls this path).
  //   3. The route-group layouts that mount <AnnouncementBanner> as
  //      server components — `app/(app)/layout.tsx` and
  //      `app/(content)/layout.tsx`. These wrap every public entity
  //      page, all of which sit behind PUBLIC_ENTITY_CACHE (s-maxage=
  //      3600) at the edge, so the banner HTML is baked into every
  //      cached page. Without a layout-level revalidation an admin
  //      delete only takes effect after the 1h edge TTL expires.
  //      `revalidatePath("/", "layout")` is the supported way to
  //      evict every page under the root layout in one call.
  //
  // TODO: convert the banner to a client island fetching
  // /api/announcements directly (see AGENTS.md "Auth-gated content
  // on edge-cached routes"). That removes the dependency on
  // layout-wide cache eviction — admin edits would surface within
  // the 60s API SWR window regardless of which edge-cached page the
  // user is on.
  //
  // Next 16 `revalidateTag` requires the second profile arg ("default"
  // matches the default fetch profile used by unstable_cache).
  revalidateTag("announcements", "default");
  revalidatePath("/admin/announcements");
  revalidatePath("/api/announcements");
  revalidatePath("/", "layout");
}

// ─── Manual MB / LB cache busts ─────────────────────────────────────

/**
 * Bust a single MB entity cache slot. Useful when a MB-side write
 * (e.g. a tag vote made before we wired revalidate-on-vote, or an
 * edit performed directly on musicbrainz.org) hasn't surfaced on
 * Achordion because the Next data cache is still holding the
 * pre-write response.
 *
 * Entity strings match the TagEntity union: `artist`, `release-group`,
 * `recording`, `release`. Wrapper around `revalidateTag` so the admin
 * UI / a quick API hit can target by MBID without juggling the cache-
 * tag string format directly.
 */
const RevalidateEntitySchema = z.object({
  entity: z.enum(["artist", "release-group", "recording", "release"]),
  mbid: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
});

export async function revalidateMbEntity(input: unknown): Promise<void> {
  await requireAdmin();
  const { entity, mbid } = RevalidateEntitySchema.parse(input);
  const key =
    entity === "release-group"
      ? `mb:release-group:${mbid}`
      : entity === "artist"
        ? `mb:artist:${mbid}`
        : entity === "release"
          ? `mb:release:${mbid}`
          : `mb:recording:${mbid}`;
  revalidateTag(key, "max");
}

/**
 * Bust the cached playlist page so a Parachord-submitted mirror-link
 * (or any other out-of-band Upstash update) surfaces without waiting
 * for the s-maxage=3600 / swr=86400 window. Also busts the LB-side
 * playlist data cache tag so getPlaylist re-fetches.
 */
const RevalidatePlaylistSchema = z.object({
  mbid: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
});

export async function revalidatePlaylist(input: unknown): Promise<void> {
  await requireAdmin();
  const { mbid } = RevalidatePlaylistSchema.parse(input);
  revalidateTag(`lb:playlist:${mbid}`, "max");
  revalidatePath(`/playlist/${mbid}`);
}

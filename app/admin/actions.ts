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

export type SaveAnnouncementsResult =
  | { ok: true; count: number }
  | { ok: false; reason: string };

/** Turn a ZodError into a single human-readable line. Field path
 *  first ("cta.label"), then the validator's message, comma-joined
 *  across issues. Plain text — the editor renders it inline. */
function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Returns a typed result instead of throwing. Server Actions that
 * throw on user-input-validation in production end up as a sanitized
 * 500 from React's error boundary — the editor's `.catch` block sees
 * an opaque "Server Components render" error rather than the actual
 * "label is required" message. Returning a result lets the editor
 * surface the underlying reason inline.
 *
 * True server faults (Redis unreachable) still throw — the admin
 * error boundary at /admin/error.tsx surfaces those with the digest
 * so they're greppable from vercel logs.
 */
export async function saveAnnouncements(
  items: unknown,
): Promise<SaveAnnouncementsResult> {
  // Every branch logs so the failure mode of a future
  // "saveAnnouncements crashed" report is greppable from vercel logs.
  // The action's success path also logs a single confirmation line.
  await requireAdmin();
  let validated: z.infer<typeof AnnouncementsArraySchema>;
  try {
    validated = AnnouncementsArraySchema.parse(items);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const reason = formatZodIssues(err);
      console.warn(
        `[admin] saveAnnouncements: schema validation failed — ${reason}`,
      );
      return { ok: false, reason };
    }
    console.error(
      `[admin] saveAnnouncements: schema validation threw non-ZodError — ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
  let r: ReturnType<typeof requireRedis>;
  try {
    r = requireRedis();
  } catch (err) {
    console.error(
      `[admin] saveAnnouncements: redis unavailable — ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
  try {
    if (validated.length === 0) {
      await r.del(ANNOUNCEMENTS_KEY);
    } else {
      await r.set(ANNOUNCEMENTS_KEY, JSON.stringify(validated));
    }
  } catch (err) {
    console.error(
      `[admin] saveAnnouncements: redis write failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
  console.log(
    `[admin] saveAnnouncements: ok count=${validated.length}`,
  );
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
  return { ok: true, count: validated.length };
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

/**
 * Bust the Critical Darlings surface. Unlike the MB/playlist busts this
 * takes no id — the picks live in a single Upstash row behind one tag.
 * Needed because a manual store edit in Upstash (a `DEL`, a hand-fixed
 * entry) does NOT trigger the `revalidateTag`/`revalidatePath` the
 * ingest route fires, so the page + feed keep serving the pre-edit
 * cache for up to their 12h revalidate window. Mirrors the ingest
 * route's bust set.
 */
export async function revalidateCriticalDarlings(): Promise<void> {
  await requireAdmin();
  revalidateTag("critical-darlings", "max");
  revalidatePath("/explore/critical-darlings");
  revalidatePath("/api/critical-darlings/feed.xml");
}

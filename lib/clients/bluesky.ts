import { z } from "zod";

/**
 * Bluesky / ATProto public API client.
 *
 * Why we use this: optional cross-platform identity. A user can paste a
 * Bluesky handle into their Achordion settings; if their Bluesky bio
 * contains a link back to their Achordion profile (two-way handshake),
 * we render their Bluesky avatar / display name on their profile page.
 * No OAuth, no app password — every endpoint we hit is public and
 * read-only.
 *
 * Custom-domain handles (e.g. `jherskowitz.com`) work identically to
 * `*.bsky.social` ones: the AppView resolves the domain via DNS TXT or
 * `.well-known/atproto-did` and returns the same DID we'd get for any
 * other handle.
 *
 * Constraints:
 *   - The "public AppView" (public.api.bsky.app) is unauthenticated and
 *     rate-limited per IP. We cache resolveHandle / getProfile via
 *     Next.js fetch + unstable_cache at call sites, so a profile-page
 *     view doesn't re-hit Bluesky on every render.
 *   - All call sites should treat thrown errors / null as "feature
 *     unavailable, fall back to identity-less rendering" — we never
 *     want a Bluesky outage to break an Achordion profile page.
 *
 * Docs: https://docs.bsky.app/docs/api
 */

const PUBLIC_APPVIEW = "https://public.api.bsky.app/xrpc";

const ResolveHandleSchema = z.object({
  did: z.string().min(1),
});

const ProfileSchema = z.object({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().url().optional(),
  banner: z.string().url().optional(),
  followersCount: z.number().int().nonnegative().optional(),
  followsCount: z.number().int().nonnegative().optional(),
  postsCount: z.number().int().nonnegative().optional(),
});

export type BskyProfile = z.infer<typeof ProfileSchema>;

const FollowProfileSchema = z.object({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().url().optional(),
});

export type BskyFollowProfile = z.infer<typeof FollowProfileSchema>;

const FollowsResponseSchema = z.object({
  follows: z.array(FollowProfileSchema),
  cursor: z.string().optional(),
});

/**
 * Strip @-prefix, scheme, and trailing slashes off whatever the user
 * pasted. Bluesky handles are bare domains, so everything else is noise.
 *
 * `@jherskowitz.bsky.social` → `jherskowitz.bsky.social`
 * `https://jherskowitz.com/` → `jherskowitz.com`
 * `bsky.app/profile/foo.com` → `foo.com`
 */
export function normalizeHandle(input: string): string {
  let h = input.trim().toLowerCase();
  // Drop a leading @
  h = h.replace(/^@+/, "");
  // Drop scheme
  h = h.replace(/^https?:\/\//, "");
  // bsky.app/profile/<handle> form
  h = h.replace(/^bsky\.app\/profile\//, "");
  // Drop everything after the first slash and any trailing dots
  h = h.split("/")[0] ?? "";
  h = h.replace(/\.+$/, "");
  return h;
}

/**
 * Resolve a handle to its DID. Throws on any failure (unknown handle,
 * network error, malformed response). Callers should catch and surface
 * a user-facing "we couldn't find that handle" message.
 */
export async function resolveHandle(handle: string): Promise<string> {
  const url = `${PUBLIC_APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    // Short cache — a handle's DID is stable but we don't want to
    // pin a stale mapping across days.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`resolveHandle failed (${res.status}) for ${handle}`);
  }
  const json = await res.json();
  return ResolveHandleSchema.parse(json).did;
}

/**
 * Bluesky's CDN serves avatar/banner blobs at
 * `/img/avatar/plain/<did>/<cid>@<format>` — the format suffix is
 * required, otherwise the CDN 404s. Some `app.bsky.actor.getProfile`
 * responses return the URL with the suffix, others without (varies
 * by AppView build). Normalise so the rendered `<img>` always points
 * at a working URL.
 *
 * Defaults to `@jpeg` since that's the format the CDN serves for
 * the vast majority of avatars (the suffix is a hint, not a
 * filename — the CDN converts on the fly).
 */
function ensureBskyBlobFormat(url: string): string {
  if (!url.startsWith("https://cdn.bsky.app/img/")) return url;
  if (/@(jpeg|png|webp|avif)$/i.test(url)) return url;
  return `${url}@jpeg`;
}

/**
 * Fetch a Bluesky profile by handle or DID. Returns null on any
 * failure — profile-page renders should degrade quietly when Bluesky
 * is unreachable.
 */
export async function getProfile(actor: string): Promise<BskyProfile | null> {
  const url = `${PUBLIC_APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      // 5-minute revalidate — display name / avatar / bio change
      // rarely enough that a bit of staleness on profile pages is
      // fine, and this keeps us off Bluesky's per-IP rate limit on
      // popular profiles.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = ProfileSchema.parse(json);
    return {
      ...parsed,
      avatar: parsed.avatar ? ensureBskyBlobFormat(parsed.avatar) : undefined,
      banner: parsed.banner ? ensureBskyBlobFormat(parsed.banner) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Walk a user's Bluesky follow graph. Returns up to `maxFollows`
 * profiles (default 1000 — covers ~99% of accounts; the long tail
 * with bigger graphs trades some completeness for not slamming the
 * AppView with 50+ paginated calls per page render).
 *
 * The returned profiles include avatar URLs already normalised via
 * the same `@jpeg` blob-format suffix as `getProfile`. Each call
 * fetches one page of 100 follows; we accumulate until cursor is
 * empty or we hit the cap. On any error mid-walk, returns whatever
 * was collected so far rather than throwing — partial results are
 * better than nothing for "find friends" surfaces.
 */
export async function getFollows(
  actor: string,
  maxFollows = 1000,
): Promise<BskyFollowProfile[]> {
  const out: BskyFollowProfile[] = [];
  let cursor: string | undefined;
  while (out.length < maxFollows) {
    const params = new URLSearchParams({ actor, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const url = `${PUBLIC_APPVIEW}/app.bsky.graph.getFollows?${params}`;
    let json: unknown;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        // Per-page cache for 10 min — follow graph changes slowly
        // enough that this trades acceptable staleness for far
        // fewer AppView calls under repeat page loads.
        next: { revalidate: 600 },
      });
      if (!res.ok) break;
      json = await res.json();
    } catch {
      break;
    }
    const parsed = FollowsResponseSchema.safeParse(json);
    if (!parsed.success) break;
    for (const p of parsed.data.follows) {
      out.push({
        ...p,
        avatar: p.avatar ? ensureBskyBlobFormat(p.avatar) : undefined,
      });
      if (out.length >= maxFollows) break;
    }
    cursor = parsed.data.cursor;
    if (!cursor) break;
  }
  return out;
}

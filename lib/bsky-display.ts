import "server-only";

import { unstable_cache } from "next/cache";
import {
  getFollows,
  getProfile as getBskyProfile,
  type BskyFollowProfile,
  type BskyProfile,
} from "@/lib/clients/bluesky";
import { getBskyLink, lbUsernamesForDids } from "@/lib/bsky-link";
import { isFeatureEnabled } from "@/lib/flags";

/**
 * Combined "should we show Bluesky data for this profile to this
 * viewer?" lookup. Returns the live Bluesky profile when:
 *   - the bsky-link feature flag is on for the viewer,
 *   - the profile owner has a verified Bluesky link, and
 *   - Bluesky's public AppView returns a profile.
 *
 * Returns null otherwise. Multiple call sites within a single render
 * (e.g. UserPageHeader's avatar override + BlueskyStrip below it)
 * share the unstable_cache slot keyed by DID, so this is effectively
 * one Bluesky fetch per (viewer, profile-owner) render.
 */
export async function getBskyDisplayProfile(
  name: string,
  viewer: string | null,
): Promise<BskyProfile | null> {
  if (!(await isFeatureEnabled("bsky-link", viewer))) return null;
  const link = await getBskyLink(name);
  if (!link) return null;
  const cached = unstable_cache(
    () => getBskyProfile(link.did),
    ["bsky-profile", link.did],
    { revalidate: 300, tags: [`bsky-profile:${link.did}`] },
  );
  const profile = await cached();
  if (!profile) return null;
  // Normalise blob URLs *after* the cache so previously-cached
  // entries (written before we added the @jpeg suffix) still render
  // correctly without waiting for the 5-min revalidate window.
  return {
    ...profile,
    avatar: profile.avatar ? ensureBskyBlobFormat(profile.avatar) : undefined,
    banner: profile.banner ? ensureBskyBlobFormat(profile.banner) : undefined,
  };
}

function ensureBskyBlobFormat(url: string): string {
  if (!url.startsWith("https://cdn.bsky.app/img/")) return url;
  if (/@(jpeg|png|webp|avif)$/i.test(url)) return url;
  return `${url}@jpeg`;
}

/**
 * Batch lookup: given a list of LB usernames, return a Map from
 * username (lower-cased key — matches the bsky-link store key) to
 * Bluesky avatar URL for those who have linked. Empty Map when:
 *   - the viewer's bsky-link flag is off,
 *   - no listed user has linked, or
 *   - Bluesky is unreachable for every linked user.
 *
 * Cost: one Upstash MGET across all `bsky-link:<name>` rows, plus
 * one Bluesky `app.bsky.actor.getProfile` per linked match. Each
 * Bluesky call is `unstable_cache`-wrapped per-DID (5min revalidate
 * — shared cache slot with the profile-page header lookup), so the
 * second visitor to any list with the same usernames is a cache
 * hit. Failed individual fetches are skipped silently — the
 * avatar just falls back to DiceBear for that one row.
 *
 * Use this on server components that render multiple `<UserAvatar>`
 * in a list (top-listeners, followers / following grids, similar-
 * users, find-friends). The returned Map is passed alongside the
 * list and each row's `<UserAvatar imageUrl={...}>` reads from it.
 */
export async function resolveBskyAvatarsForUsers(
  viewer: string | null,
  lbUsernames: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (lbUsernames.length === 0) return out;
  if (!(await isFeatureEnabled("bsky-link", viewer))) return out;

  // Deduplicate + lower-case for stable Redis keys. Preserve input
  // order isn't required (callers index by username), but a Set
  // dedup avoids hitting the same key twice when the same user
  // appears multiple times across a merged list.
  const unique = Array.from(
    new Set(lbUsernames.map((n) => n.toLowerCase())),
  );

  // Pull bsky-link rows in parallel — each `getBskyLink` is already
  // a single Redis GET; Promise.all keeps the wall time at one
  // round trip. (Could be a single MGET, but the function shape
  // would diverge from getBskyLink's existing typed return — not
  // worth the abstraction for a max-100-row list.)
  const links = await Promise.all(unique.map((name) => getBskyLink(name)));

  // Resolve Bluesky profiles for the linked users in parallel. Each
  // call goes through the per-DID unstable_cache slot used elsewhere
  // (profile-page header, find-friends section), so warm requests
  // are zero-cost.
  const resolved = await Promise.all(
    links.map(async (link) => {
      if (!link) return null;
      const cached = unstable_cache(
        () => getBskyProfile(link.did),
        ["bsky-profile", link.did],
        { revalidate: 300, tags: [`bsky-profile:${link.did}`] },
      );
      const profile = await cached();
      if (!profile?.avatar) return null;
      return { lbUsername: link.handle, avatar: profile.avatar };
    }),
  );

  unique.forEach((name, i) => {
    const link = links[i];
    const r = resolved[i];
    if (!link || !r) return;
    // Use the LB username we were given (already lower-cased) as
    // the map key, not `link.handle` which is the Bluesky handle.
    out.set(name, ensureBskyBlobFormat(r.avatar));
  });
  return out;
}

export interface BskyFriendMatch {
  /** MusicBrainz username (the Achordion identity). */
  lbUsername: string;
  /** Bluesky handle for display + deep link. */
  bskyHandle: string;
  /** Bluesky display name when set. */
  bskyDisplayName?: string;
  /** Bluesky avatar URL with @jpeg suffix applied. */
  bskyAvatar?: string;
}

/**
 * Find the viewer's Bluesky follows who've also linked their account
 * to Achordion. Walks the viewer's bsky follow graph (cached via
 * Next fetch revalidate inside `getFollows`), then does a single
 * Redis `MGET` over the reverse-DID key space to filter to matches.
 *
 * Returns an empty array when:
 *   - the bsky-link feature flag is off for the viewer,
 *   - the viewer hasn't linked their own Bluesky account, or
 *   - Bluesky's AppView is unreachable.
 *
 * The viewer is excluded from results (they don't need to "find"
 * themselves). Order preserved from Bluesky's follow list (most
 * recently followed first per the AppView default).
 */
export async function findBlueskyFriends(
  viewer: string | null,
): Promise<BskyFriendMatch[]> {
  if (!viewer) return [];
  if (!(await isFeatureEnabled("bsky-link", viewer))) return [];
  const viewerLink = await getBskyLink(viewer);
  if (!viewerLink) return [];

  const follows = await getFollows(viewerLink.did);
  if (follows.length === 0) return [];

  // Drop the viewer themselves if Bluesky echoes them back (rare,
  // but cheaper to filter than to assume it never happens).
  const dids = follows
    .map((f: BskyFollowProfile) => f.did)
    .filter((d) => d !== viewerLink.did);
  const matches = await lbUsernamesForDids(dids);
  if (matches.size === 0) return [];

  return follows
    .filter((f) => matches.has(f.did))
    .map((f) => ({
      lbUsername: matches.get(f.did)!,
      bskyHandle: f.handle,
      bskyDisplayName: f.displayName,
      bskyAvatar: f.avatar,
    }));
}

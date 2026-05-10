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

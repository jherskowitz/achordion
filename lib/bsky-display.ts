import "server-only";

import { unstable_cache } from "next/cache";
import {
  getProfile as getBskyProfile,
  type BskyProfile,
} from "@/lib/clients/bluesky";
import { getBskyLink } from "@/lib/bsky-link";
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

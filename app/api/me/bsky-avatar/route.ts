import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBskyDisplayProfile } from "@/lib/bsky-display";

/**
 * Viewer's currently-linked Bluesky avatar URL.
 *
 * Used by the client-only `<SiteHeader>` to swap the small avatar
 * pip in the trailing slot from the DiceBear default (or MB-provided
 * image) to the user's Bluesky avatar — same override path the
 * profile-page header already uses, but reachable from a client
 * component without breaking the header's "render identical-for-
 * everyone SSR so the rest of the app stays edge-cacheable"
 * contract.
 *
 * Response shape: `{ avatar: string | null }`. Returns null when:
 *   - viewer isn't signed in,
 *   - the bsky-link feature flag is off for the viewer,
 *   - the viewer hasn't linked their own Bluesky account, or
 *   - Bluesky's AppView is unreachable.
 *
 * The header's `useQuery` falls back to the session's `user.image`
 * field in any of those cases — identical to today's behaviour
 * before this endpoint existed.
 *
 * No-cache headers because the flag, link, and Bluesky-side avatar
 * can all change independently and the response is per-viewer; the
 * 5-minute Next-cache wrapped around `getBskyProfile` inside
 * `getBskyDisplayProfile` is what limits the AppView call rate.
 */
export async function GET() {
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  if (!viewer) {
    return NextResponse.json({ avatar: null }, { headers: NO_STORE });
  }
  const profile = await getBskyDisplayProfile(viewer, viewer);
  return NextResponse.json(
    { avatar: profile?.avatar ?? null },
    { headers: NO_STORE },
  );
}

const NO_STORE = { "cache-control": "private, no-store" } as const;

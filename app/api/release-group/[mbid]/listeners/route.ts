import { NextResponse, type NextRequest } from "next/server";
import { getReleaseGroupListeners } from "@/lib/clients/listenbrainz";
import { resolveBskyAvatarsForUsers } from "@/lib/bsky-display";

/**
 * Listener-stats payload for a release-group page.
 *
 * Why a separate endpoint + client island (see
 * `components/achordion/album-listener-stats.tsx`): the listens /
 * listeners counts and the Top Listeners list come from a LB stats
 * call (`getReleaseGroupListeners`) that can be slow or hang on some
 * entities. When that ran inside the page's server render, its
 * Suspense boundary could wedge the whole streamed response — and
 * because `/release-group/[mbid]` is CDN-cached, the origin render
 * must resolve every boundary before responding, so one hung LB call
 * stalled the entire page (observed: a 30s+ partial render, browser
 * stuck on the skeleton). Pulling the stats into a post-hydration
 * fetch removes LB from the render path entirely: the page paints
 * instantly and the stats pop in (or quietly don't) on their own.
 *
 * Unlike the reviews endpoint, this payload is **viewer-agnostic**
 * (counts + public top-listener list + public Bluesky avatars are the
 * same for everyone), so it is CDN-cacheable — `s-maxage` keeps the
 * function-invocation + LB-call cost near zero across all visitors.
 */

interface ListenersPayload {
  totalListens: number | null;
  totalListeners: number | null;
  listeners: Array<{ user_name: string; listen_count: number }>;
  /** lower-cased LB username -> Bluesky avatar URL. JSON-serialized
   *  from the Map `resolveBskyAvatarsForUsers` returns; the client
   *  rebuilds a Map for `<UserAvatar imageUrl>`. */
  bskyAvatars: Record<string, string>;
}

// 6h shared-edge cache mirrors getReleaseGroupListeners' own
// revalidate window; stale-while-revalidate keeps it warm. The
// payload is identical for every visitor so the edge can share one
// response. CDN-Cache-Control (not Cache-Control) so Next doesn't
// downgrade it the way it does for dynamic routes.
const CACHE: Record<string, string> = {
  "CDN-Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mbid: string }> },
): Promise<NextResponse> {
  const { mbid } = await params;

  const stats = await getReleaseGroupListeners(mbid).catch(() => null);
  const listeners = stats?.listeners ?? [];

  // Top listeners only — bound the bsky lookup to what we render.
  const top = listeners.slice(0, 10);
  const avatarMap = await resolveBskyAvatarsForUsers(
    null,
    top.map((l) => l.user_name),
  ).catch(() => new Map<string, string>());

  const payload: ListenersPayload = {
    totalListens: stats?.total_listen_count ?? null,
    totalListeners: stats?.total_user_count ?? null,
    listeners: top,
    bskyAvatars: Object.fromEntries(avatarMap),
  };
  return NextResponse.json(payload, { headers: CACHE });
}

import { NextResponse, type NextRequest } from "next/server";
import { getArtistListeners } from "@/lib/clients/listenbrainz";
import { resolveBskyAvatarsForUsers } from "@/lib/bsky-display";

/**
 * Listener-stats payload for an artist page — counts + Top Listeners.
 *
 * Same pattern + shape as `/api/release-group/[mbid]/listeners`: a
 * client island (`<EntityHeaderListenerStats>` / `<EntityTopListeners>`)
 * fetches this post-hydration so the slow/hang-prone LB stats call
 * (`getArtistListeners`) never sits in the CDN-cached artist page's
 * server render. Viewer-agnostic, so CDN-cacheable.
 */

interface ListenersPayload {
  totalListens: number | null;
  totalListeners: number | null;
  listeners: Array<{ user_name: string; listen_count: number }>;
  bskyAvatars: Record<string, string>;
}

const CACHE: Record<string, string> = {
  "CDN-Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mbid: string }> },
): Promise<NextResponse> {
  const { mbid } = await params;

  const stats = await getArtistListeners(mbid).catch(() => null);
  const top = (stats?.listeners ?? []).slice(0, 10);
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

import { NextResponse, type NextRequest } from "next/server";
import { getRecordingPopularity } from "@/lib/clients/listenbrainz";

/**
 * Listener-stats payload for a recording page — header counts only.
 *
 * The recording page intentionally has NO Top Listeners section (LB
 * has no per-recording top-listeners endpoint), so `listeners` is
 * always empty here; only the header listens/listeners counts are
 * populated, from `getRecordingPopularity`.
 *
 * Same client-island pattern + normalized shape as the album/artist
 * listener endpoints, so `<EntityHeaderListenerStats>` can consume it
 * unchanged and the (hang-prone) LB popularity call stays off the
 * CDN-cached recording page's server render. Viewer-agnostic →
 * CDN-cacheable.
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

  const popularity = await getRecordingPopularity(mbid).catch(() => null);

  const payload: ListenersPayload = {
    totalListens: popularity?.totalListenCount ?? null,
    totalListeners: popularity?.totalUserCount ?? null,
    listeners: [],
    bskyAvatars: {},
  };
  return NextResponse.json(payload, { headers: CACHE });
}

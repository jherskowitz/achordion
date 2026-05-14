import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import {
  getPlaylist,
  type LbRadioTrack,
  type PlaylistDetail,
} from "@/lib/clients/listenbrainz";

/**
 * Per-playlist preview feed — returns just enough track data to
 * render the 2×2 cover mosaic on `<PlaylistCard>`. Used by the
 * IntersectionObserver-driven mosaic loader so cards that scroll
 * into view pay one cheap fetch each, instead of every card on the
 * page firing a `getPlaylist` request upfront.
 *
 * We piggyback on the full `getPlaylist` call (LB has no
 * tracks-only endpoint) but trim to the first 16 entries before
 * sending so the response stays small. `<PlaylistCoverMosaic>`
 * only needs 4 unique covers from the head of the tracklist.
 *
 * Caching strategy (avoids LB rate-limit when a heavy scroll fans
 * out 50+ card fetches):
 *
 *   1. Unauthenticated `getPlaylist` runs first. It uses the LB
 *      client's own 5-min Next data cache (tag `lb:playlist:<mbid>`,
 *      busted by the edit/delete actions). Public playlists never
 *      progress past this step — they're fully cached for everyone.
 *   2. If unauthenticated returns null AND the viewer has an LB
 *      token, we fall through to an authenticated lookup wrapped in
 *      `unstable_cache` keyed by `[mbid, viewer-username]`. Same tag,
 *      same revalidate window — so the existing edit/delete tag
 *      busts evict this slot too. The viewer-username in the cache
 *      key keeps private data from cross-sharing between sessions
 *      even though two different tokens could theoretically hit the
 *      same mbid URL: each user's slot is independent.
 *
 * Net effect: an owner scrolling 60 private playlist cards now pays
 * roughly one LB call per playlist *per 5 minutes*, not per scroll.
 * Edits surface instantly via the existing tag-revalidation in the
 * playlist edit/delete server actions.
 */
export const dynamic = "force-dynamic";

const PREVIEW_TRACK_LIMIT = 16;
const PRIVATE_PREVIEW_REVALIDATE_S = 5 * 60;

interface RouteContext {
  params: Promise<{ mbid: string }>;
}

export interface PlaylistPreviewResponse {
  tracks: Array<
    Pick<
      LbRadioTrack,
      "title" | "artistName" | "releaseMbid" | "caaReleaseMbid" | "caaId"
    >
  >;
  isPublic: boolean;
}

/**
 * Authenticated `getPlaylist` wrapped in a tagged 5-min cache slot,
 * scoped by viewer username so private data never leaks across
 * sessions. Returns `null` on any error — the caller treats both
 * fetch failure and "viewer doesn't own this playlist" as "no
 * private data available."
 */
function fetchAuthedPlaylistCached(
  mbid: string,
  token: string,
  viewerUsername: string,
): Promise<PlaylistDetail | null> {
  return unstable_cache(
    async () => {
      try {
        return await getPlaylist(mbid, token);
      } catch {
        return null;
      }
    },
    [
      "playlist-preview",
      "owner",
      mbid,
      // Lower-cased so casing differences don't fragment the slot.
      // The session username is canonical from the JWT.
      viewerUsername.toLowerCase(),
    ],
    {
      revalidate: PRIVATE_PREVIEW_REVALIDATE_S,
      tags: [`lb:playlist:${mbid}`],
    },
  )();
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { mbid } = await ctx.params;
  if (!mbid) {
    return NextResponse.json({ error: "missing mbid" }, { status: 400 });
  }

  const session = await auth();
  const viewer = session?.user?.mbUsername;
  const token = viewer ? await getLbTokenForRequest() : null;

  try {
    // Step 1: try the cheap, fully-cached unauthenticated path. This
    // covers every public playlist regardless of viewer, and avoids
    // forcing the no-store authed path even for the playlist owner
    // when the playlist they're viewing happens to be public.
    let detail = await getPlaylist(mbid).catch(() => null);
    let usedToken = false;
    // Step 2: private playlists 404 unauthenticated. Fall through to
    // the cached authed lookup if the viewer has a token. The slot is
    // viewer-scoped so non-owner sessions don't get to read someone
    // else's private playlist via a shared cache.
    if (!detail && token && viewer) {
      detail = await fetchAuthedPlaylistCached(mbid, token, viewer);
      usedToken = !!detail;
    }
    if (!detail) {
      return NextResponse.json(
        { error: "playlist not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const tracks = detail.tracks
      .slice(0, PREVIEW_TRACK_LIMIT)
      .map((t) => ({
        title: t.title,
        artistName: t.artistName,
        releaseMbid: t.releaseMbid,
        caaReleaseMbid: t.caaReleaseMbid,
        caaId: t.caaId,
      }));
    const payload: PlaylistPreviewResponse = {
      tracks,
      isPublic: detail.isPublic,
    };
    // Public-path responses CDN-share cheaply. Authed-path responses
    // contain private playlist content — must not cross-share at the
    // edge layer, even though the server-side unstable_cache slot is
    // viewer-keyed and safe.
    const headers = usedToken
      ? { "Cache-Control": "private, no-store" }
      : {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        };
    return NextResponse.json(payload, { headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    );
  }
}

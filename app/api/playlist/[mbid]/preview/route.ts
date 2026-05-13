import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import {
  getPlaylist,
  type LbRadioTrack,
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
 * Auth: passes the viewer's LB token when they're the playlist
 * owner — required for private playlists. Public playlists work
 * with or without a token; private ones 404 anonymously.
 */
export const dynamic = "force-dynamic";

const PREVIEW_TRACK_LIMIT = 16;

interface RouteContext {
  params: Promise<{ mbid: string }>;
}

export interface PlaylistPreviewResponse {
  tracks: Array<
    Pick<
      LbRadioTrack,
      "title" | "artist" | "releaseMbid" | "caaReleaseMbid" | "caaId"
    >
  >;
  isPublic: boolean;
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
  // We don't know if the viewer is the owner until after the fetch,
  // so just always send the token when one's available. LB ignores
  // the token for public playlists owned by others.
  const token = viewer ? await getLbTokenForRequest() : null;

  try {
    const detail = await getPlaylist(mbid, token ?? undefined);
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
        artist: t.artist,
        releaseMbid: t.releaseMbid,
        caaReleaseMbid: t.caaReleaseMbid,
        caaId: t.caaId,
      }));
    const payload: PlaylistPreviewResponse = {
      tracks,
      isPublic: detail.isPublic,
    };
    // Public playlists CDN-cache cheaply; private/self responses
    // stay browser-private. We don't know whether the viewer's
    // token was needed to resolve this fetch without a more
    // involved owner check, so the safe default for any token-
    // attached lookup is no-store — anonymous reads cache normally.
    const headers = token
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

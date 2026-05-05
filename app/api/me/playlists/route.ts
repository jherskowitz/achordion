import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getUserPlaylistsForViewer } from "@/lib/clients/listenbrainz";

/**
 * Lazy-loaded list of the viewer's own playlists, used by the
 * track-actions "Add to playlist" submenu. Returns an empty array
 * (rather than 4xx) for the no-token case so the menu can show a
 * friendly empty state without React Query treating it as a fatal
 * error.
 */
export async function GET() {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    return NextResponse.json({ playlists: [] }, { status: 401 });
  }
  const token = await getLbTokenForRequest();
  if (!token) {
    return NextResponse.json({ playlists: [] }, { status: 200 });
  }
  try {
    const playlists = await getUserPlaylistsForViewer(viewer, token, 20);
    return NextResponse.json({ playlists });
  } catch {
    return NextResponse.json({ playlists: [] }, { status: 200 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getUserFollowers } from "@/lib/clients/listenbrainz";

/**
 * Lazy-loaded list of usernames following the viewer, used by the
 * track-actions Recommend submenu and picker dialog. Mirrors the
 * playlists route: returns an empty list (rather than 4xx) for
 * unauthenticated/no-token cases so the UI can surface a friendly
 * empty state without React Query treating it as an error.
 */
export async function GET() {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    return NextResponse.json({ followers: [] }, { status: 401 });
  }
  // The followers endpoint itself doesn't need a token, but we keep
  // the same gate as /api/me/playlists for symmetry — a viewer
  // without a token usually isn't acting on their own LB account
  // anyway.
  const token = await getLbTokenForRequest();
  if (!token) {
    return NextResponse.json({ followers: [] }, { status: 200 });
  }
  try {
    const followers = await getUserFollowers(viewer);
    return NextResponse.json({ followers });
  } catch {
    return NextResponse.json({ followers: [] }, { status: 200 });
  }
}

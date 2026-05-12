import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getFollowing } from "@/lib/clients/listenbrainz";

/**
 * Lazy-loaded list of usernames the viewer follows. Mirrors
 * `/api/me/followers` (same shape, same auth gate). Used by the
 * pin-track-dialog's `@username` autocomplete to filter against —
 * the viewer's following set is the most likely candidate pool
 * for tagging (people they actually know on LB).
 *
 * Returns `{ following: string[] }`. Empty array for unauthed /
 * no-token cases so the UI can surface a no-suggestions state
 * without React Query treating it as an error.
 */
export async function GET() {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    return NextResponse.json({ following: [] }, { status: 401 });
  }
  const token = await getLbTokenForRequest();
  if (!token) {
    return NextResponse.json({ following: [] }, { status: 200 });
  }
  try {
    const following = await getFollowing(viewer);
    return NextResponse.json({ following });
  } catch {
    return NextResponse.json({ following: [] }, { status: 200 });
  }
}

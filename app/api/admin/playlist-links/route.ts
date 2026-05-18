import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getPlaylistLinks } from "@/lib/playlist-links-store";

/**
 * Admin-only read-through to the raw playlist-links Upstash entry.
 *
 * `GET /api/admin/playlist-links?mbid=<uuid>` returns the stored
 * `PlaylistLinksEntry` or `{ entry: null }` when nothing's there.
 *
 * Used to debug "Parachord said it submitted but the playlist page
 * shows no Listen-on row" — surfaces whether the Upstash slot is
 * empty (Parachord didn't submit, or its submit failed), or whether
 * the slot is populated but the page render is reading it wrong.
 */
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 404, headers: NO_STORE });
  }
  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim();
  if (!mbid || !UUID_RE.test(mbid)) {
    return NextResponse.json(
      { error: "missing or malformed mbid query param" },
      { status: 400, headers: NO_STORE },
    );
  }
  const entry = await getPlaylistLinks(mbid);
  return NextResponse.json({ entry }, { headers: NO_STORE });
}

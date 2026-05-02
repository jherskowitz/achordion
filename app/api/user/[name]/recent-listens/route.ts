import { NextRequest, NextResponse } from "next/server";
import { getRecentListens } from "@/lib/clients/listenbrainz";

interface RouteContext {
  params: Promise<{ name: string }>;
}

/**
 * Returns the most recent listens for a user. Used by the live polling
 * component on the profile page so new scrobbles surface without a
 * page reload.
 *
 * Response shape kept narrow on purpose:
 *  - `listens`: same array shape as the server-rendered initial state
 *  - `latestTs`: convenience for fast-path "did anything change?" diff
 *
 * `getRecentListens` already revalidates at 60s through the Next data
 * cache; this route inherits that, so we don't hammer LB even when the
 * client polls quickly.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { name } = await ctx.params;
  if (!name) {
    return NextResponse.json({ error: "missing username" }, { status: 400 });
  }
  try {
    const listens = await getRecentListens(name, { count: 25 });
    const latestTs = listens[0]?.listened_at ?? null;
    return NextResponse.json(
      { listens, latestTs },
      // Browsers and intermediate caches can hold for 10s, then must
      // revalidate. Aligns roughly with the polling cadence.
      { headers: { "Cache-Control": "public, max-age=10, must-revalidate" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "fetch failed",
      },
      { status: 502 },
    );
  }
}

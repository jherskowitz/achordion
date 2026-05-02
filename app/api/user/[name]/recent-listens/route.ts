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
    // Bypass Next data cache so each poll actually hits LB. Without
    // `live: true` the cached response would freeze for 60s and the
    // client-side polling would only see new scrobbles every minute.
    const listens = await getRecentListens(name, { count: 25, live: true });
    const latestTs = listens[0]?.listened_at ?? null;
    return NextResponse.json(
      { listens, latestTs },
      // Tell browsers + intermediate caches to never store this — the
      // whole point of the route is real-time-ish updates.
      { headers: { "Cache-Control": "no-store" } },
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

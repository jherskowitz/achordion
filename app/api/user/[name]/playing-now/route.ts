import { NextRequest, NextResponse } from "next/server";
import { getPlayingNow } from "@/lib/clients/listenbrainz";

interface RouteContext {
  params: Promise<{ name: string }>;
}

/**
 * Returns the user's currently-playing track (if any) for the live
 * on-air indicator. Bypasses the Next data cache (`live: true` flips
 * `getPlayingNow` to no-store upstream) so we don't pay the 30s data-
 * cache TTL when track changes need to surface.
 *
 * The browser still gets a fresh-ish payload via a tiny edge SWR
 * window. Why two layers:
 *   - Browser/`Cache-Control: no-store` — the polling client
 *     intentionally re-fires every 10–60s and we don't want the
 *     browser to serve a stale entry between ticks.
 *   - Edge/`CDN-Cache-Control: s-maxage=5, stale-while-revalidate=15`
 *     — when N viewers watch the same popular profile, the edge
 *     collapses N near-simultaneous polls into 1 origin call. Five
 *     seconds is short enough that track-change latency stays under
 *     the active-poll cadence; SWR keeps responses snappy during
 *     refresh bursts. CDN-Cache-Control is the header Next leaves
 *     untouched on dynamic routes (see next.config.ts notes).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { name } = await ctx.params;
  if (!name) {
    return NextResponse.json({ error: "missing username" }, { status: 400 });
  }
  try {
    const listen = await getPlayingNow(name, { live: true });
    return NextResponse.json(
      { listen },
      {
        headers: {
          "Cache-Control": "no-store",
          "CDN-Cache-Control":
            "public, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    );
  }
}

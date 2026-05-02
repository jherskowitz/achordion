import { NextRequest, NextResponse } from "next/server";
import { getPlayingNow } from "@/lib/clients/listenbrainz";

interface RouteContext {
  params: Promise<{ name: string }>;
}

/**
 * Returns the user's currently-playing track (if any) for the live
 * on-air indicator. Bypasses the Next data cache so polling sees track
 * changes within a poll cycle, not the 30s data-cache TTL.
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
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getUserPlaylists } from "@/lib/clients/listenbrainz";

/**
 * Paginated JSON feed of a user's LB playlists.
 *
 * Backs the "Load more" affordance on `/user/<name>/playlists` so the
 * client can fetch subsequent pages without a full route navigation,
 * and so filter/sort stay responsive while the rest of the list
 * streams in.
 *
 * Self-aware: when the viewer is the queried user, we attach their
 * LB token so the response includes their private playlists.
 * Everyone else gets the public-only list LB returns to anonymous
 * callers.
 *
 * Cache:
 *   - Self → `private, no-store` (private playlists must never CDN-cache).
 *   - Other → `public, s-maxage=60, swr=600` (cheap reads, ~1m
 *     freshness window for newly-published playlists).
 */
export const dynamic = "force-dynamic";

const MAX_COUNT = 100;
const DEFAULT_COUNT = 100;

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { name } = await ctx.params;
  if (!name) {
    return NextResponse.json({ error: "missing username" }, { status: 400 });
  }

  const url = new URL(req.url);
  const rawCount = Number.parseInt(url.searchParams.get("count") ?? "", 10);
  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const count = Math.max(
    1,
    Math.min(MAX_COUNT, Number.isFinite(rawCount) ? rawCount : DEFAULT_COUNT),
  );
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const session = await auth();
  const viewer = session?.user?.mbUsername;
  const isSelf =
    !!viewer && viewer.toLowerCase() === name.toLowerCase();
  const token = isSelf ? await getLbTokenForRequest() : null;

  try {
    const page = await getUserPlaylists(
      name,
      count,
      offset,
      token ?? undefined,
    );
    const headers = isSelf
      ? { "Cache-Control": "private, no-store" }
      : {
          "Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=600",
        };
    return NextResponse.json(page, { headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    );
  }
}

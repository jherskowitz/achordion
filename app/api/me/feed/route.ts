import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { mergeFeedEvents } from "@/lib/feed-merge";

/**
 * JSON polling endpoint for the `/feed` page's client island.
 *
 * Same merge pipeline the page itself uses, returned as JSON so the
 * island can polls every ~45s, prepend new events with animation,
 * and update the localStorage cache. The polling response is a
 * strict subset of what the page render produces — the merge logic
 * is shared via `lib/feed-merge.ts`, so an event seen here will
 * also be seen on the next full page render and vice versa.
 *
 * Query params:
 *   - `since` (unix seconds, optional) — return only events newer
 *     than this. Polling clients pass the `created` of their newest
 *     known event so we don't repaint things they already have.
 *   - `excludeSelf` (`"1"` to enable) — drop events authored by the
 *     viewer. Mirrors the `?source=others` filter on the page.
 *
 * Auth: session cookie. No bearer surface — the feed is a per-viewer
 * private read; apps that want feed data should reuse the user's
 * own session, not act on the user's behalf.
 *
 * Response:
 *   - 401 `{ error: "not signed in" }` — no session.
 *   - 200 `{ events: FeedEvent[], error: FeedMergeError | null }` —
 *     success. `error` is non-null when LB's native feed endpoint
 *     was unreachable; the synthetic-event sources still contribute.
 *   - 200 `{ events: [], error: "no-token" }` — signed in but no
 *     LB token configured. Client can show a re-onboarding prompt.
 *
 * Cache: `private, no-store`. Per-viewer + polling-driven; CDN
 * caching would either leak or stale.
 */
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    return NextResponse.json(
      { error: "not signed in" },
      { status: 401, headers: NO_STORE },
    );
  }
  const token = await getLbTokenForRequest();
  if (!token) {
    return NextResponse.json(
      { events: [], error: "no-token" },
      { headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  const sinceParsed = sinceRaw ? Number.parseInt(sinceRaw, 10) : NaN;
  const sinceUnix = Number.isFinite(sinceParsed) && sinceParsed > 0
    ? sinceParsed
    : undefined;
  const excludeSelf = url.searchParams.get("excludeSelf") === "1";

  const result = await mergeFeedEvents(viewer, token, {
    limit: 50,
    excludeSelf,
    sinceUnix,
  });
  return NextResponse.json(result, { headers: NO_STORE });
}

import { NextResponse, type NextRequest } from "next/server";
import { resolveTrackLinks } from "@/lib/track-links-resolver";

/**
 * Resolve a track's external streaming links on demand. Pulled by the
 * `<InlineTrackLinks>` button when a user expands the per-row expand
 * affordance — keeps the up-front render cost zero and only pays the
 * Odesli / MB roundtrip on the first click per track.
 *
 * Inputs (any subset acceptable):
 *   - `mbid` (preferred) — recording MBID. We pull MB url-rels for the
 *     full set of streaming services + use the first as the Odesli
 *     seed.
 *   - `seedUrl` — explicit Odesli seed (a service URL the caller
 *     already has). Skips MB entirely when present.
 *
 * Response: `{ links: [{ url, label, host }] }`. Empty list when
 * Odesli + MB both come up empty.
 *
 * Cached: `s-maxage=86400` since per-track streaming-link mappings
 * are essentially static once Odesli has them indexed. Not
 * `private` — the response is the same for every viewer.
 *
 * The actual cache-first / Odesli-fallback / MB-merge / write-through
 * machinery lives in `lib/track-links-resolver.ts` so server
 * components (e.g. the embed widget) can hit the same path without
 * round-tripping through fetch.
 */

const CACHE_HEADERS: Record<string, string> = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim() || null;
  const seedUrl = url.searchParams.get("seedUrl")?.trim() || null;

  const links = await resolveTrackLinks({ mbid, seedUrl });
  return NextResponse.json({ links }, { headers: CACHE_HEADERS });
}

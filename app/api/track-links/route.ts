import { NextResponse, type NextRequest } from "next/server";
import { resolveTrackLinks } from "@/lib/track-links-resolver";
import type { LinkEntity } from "@/lib/track-links-store";

/**
 * Resolve an entity's external streaming links on demand. Pulled by
 * `<StreamingLinksRow>` (and `<InlineTrackLinks>` for per-row track
 * expansion) — keeps the up-front render cost zero and only pays the
 * Odesli / MB roundtrip on the first request per entity.
 *
 * Inputs:
 *   - `mbid` (preferred) — recording or release-group MBID. We pull
 *     MB url-rels for the full set of streaming services + use the
 *     first as the Odesli seed.
 *   - `entity` (optional, default `recording`) — which MB entity
 *     `mbid` refers to. Determines the cache namespace and which MB
 *     endpoint we hit on a miss. Aliases: `track` → recording,
 *     `album` → release-group.
 *   - `seedUrl` — explicit Odesli seed (a service URL the caller
 *     already has). Skips MB entirely when present.
 *
 * Response: `{ links: [{ url, label, host }] }`. Empty list when
 * Odesli + MB both come up empty.
 *
 * Cached: `s-maxage=86400` since streaming-link mappings are
 * essentially static once Odesli has them indexed. Not `private` —
 * the response is the same for every viewer.
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

const ENTITY_ALIASES: Record<string, LinkEntity> = {
  recording: "recording",
  track: "recording",
  "release-group": "release-group",
  album: "release-group",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim() || null;
  const seedUrl = url.searchParams.get("seedUrl")?.trim() || null;
  const entityRaw = url.searchParams.get("entity")?.trim().toLowerCase() ?? "";
  const entity: LinkEntity = ENTITY_ALIASES[entityRaw] ?? "recording";

  const links = await resolveTrackLinks({ mbid, seedUrl, entity });
  return NextResponse.json({ links }, { headers: CACHE_HEADERS });
}

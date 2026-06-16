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

// Short fresh window, long stale-while-revalidate. A track's link set
// GROWS over its first days of life — a Parachord submit, then an
// Odesli merge, then an ISRC / name back-fill — and only a Parachord
// submit busts this cache. A long s-maxage (was 24h) therefore pinned
// already-fetched URLs (notably the per-scrobble `?seedUrl=…` variants
// on Recently Played) to a stale subset for up to a day. A 5-minute
// fresh window means growth surfaces quickly; the long SWR keeps the
// row instant (serve stale, refresh in the background). The resolve is
// a cheap cache-hit (one Upstash read), so the extra revalidations
// cost little. Once a track's set is stable the data is immutable, so
// the short window costs nothing there either.
const CACHE_HEADERS: Record<string, string> = {
  "Cache-Control":
    "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
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
  // Exact (artist, title) for the name-alias bridge — lets a row whose
  // scrobble ListenBrainz never mapped to an MBID still pull a track's
  // stored links (incl. Parachord submissions under a sibling MBID).
  const artist = url.searchParams.get("artist")?.trim() || null;
  const title = url.searchParams.get("title")?.trim() || null;

  const links = await resolveTrackLinks({ mbid, seedUrl, entity, artist, title });
  return NextResponse.json({ links }, { headers: CACHE_HEADERS });
}

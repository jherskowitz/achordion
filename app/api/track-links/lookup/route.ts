import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getPublicTrackLinksEntry,
  getPublicTrackLinksEntryByIsrc,
  type LinkEntity,
} from "@/lib/track-links-store";

/**
 * Public, read-only lookup into the track-links database — the open
 * MBID → streaming-URL mapping the About page describes. Built for
 * external consumers (MusicBrainz/MetaBrainz foremost; see
 * docs/musicbrainz-track-links-api.md for the consumer-facing spec).
 *
 * CRITICALLY: this is a PURE READ, unlike `GET /api/track-links`
 * (the site's own resolver, which fans out to MusicBrainz + Odesli +
 * Deezer on a cache miss). A third-party crawl against the resolver
 * would burn our shared 1-req/sec MusicBrainz budget and Odesli quota;
 * a crawl against this endpoint costs one Redis read per miss and
 * nothing more. A miss is a plain 404 — it triggers no resolution.
 *
 * Inputs (exactly one of):
 *   - `mbid` (36-char UUID) + optional `entity` (`recording` default,
 *     `release-group`; aliases `track` / `album`)
 *   - `isrc` (e.g. GBAYE0601498) — recording lookups only
 *
 * Response: `{ entity, mbid|isrc, track_name, artist_name, album_name,
 * isrcs, resolved_at, links: [{url, label, host, source}] }`. The
 * per-link `source` provenance tags (`parachord` > `odesli` > `mb` >
 * `parachord-scrobble`) are the payload's whole value to an external
 * consumer — see the doc for import guidance.
 */

export const dynamic = "force-dynamic";

const HIT_CACHE: Record<string, string> = {
  // Entries change on Parachord submits / re-resolution; an hour of
  // CDN sharing is the right freshness/cost trade for a public corpus
  // read. The submit route revalidates pages, not this API path — a
  // consumer sees a new submit within the hour.
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};
const MISS_CACHE: Record<string, string> = {
  // Shorter negative cache: a miss can fill at any moment (a Parachord
  // user plays the track), and we don't want a day of "no data" pinned
  // at the edge for it.
  "Cache-Control": "public, s-maxage=300",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i;

function parseEntity(raw: string | null): LinkEntity | null {
  const v = (raw ?? "recording").trim().toLowerCase();
  if (v === "recording" || v === "track") return "recording";
  if (v === "release-group" || v === "album") return "release-group";
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Per-IP rate limit (the proxy's limiter is bypassed for this path so
  // datacenter callers can reach it at all — this route-level check is
  // what keeps a runaway crawl from hammering Upstash).
  const limit = await checkRateLimit("cover", request);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const url = new URL(request.url);
  const mbid = url.searchParams.get("mbid")?.trim().toLowerCase() ?? "";
  const isrc = url.searchParams.get("isrc")?.trim().toUpperCase() ?? "";
  const entity = parseEntity(url.searchParams.get("entity"));

  if (!entity) {
    return NextResponse.json(
      { error: "entity must be recording|track|release-group|album" },
      { status: 400 },
    );
  }
  if ((mbid && isrc) || (!mbid && !isrc)) {
    return NextResponse.json(
      { error: "pass exactly one of mbid or isrc" },
      { status: 400 },
    );
  }
  if (mbid && !UUID_RE.test(mbid)) {
    return NextResponse.json({ error: "malformed mbid" }, { status: 400 });
  }
  if (isrc && !ISRC_RE.test(isrc)) {
    return NextResponse.json({ error: "malformed isrc" }, { status: 400 });
  }
  if (isrc && entity !== "recording") {
    return NextResponse.json(
      { error: "isrc lookups are recording-only" },
      { status: 400 },
    );
  }

  const entry = mbid
    ? await getPublicTrackLinksEntry(mbid, entity)
    : await getPublicTrackLinksEntryByIsrc(isrc);

  if (!entry) {
    return NextResponse.json(
      { error: "no entry" },
      { status: 404, headers: MISS_CACHE },
    );
  }

  return NextResponse.json(
    {
      entity,
      ...(mbid ? { mbid } : { isrc }),
      track_name: entry.trackName,
      artist_name: entry.artistName,
      album_name: entry.albumName,
      isrcs: entry.isrcs,
      resolved_at: entry.resolvedAt,
      links: entry.links.map((l) => ({
        url: l.url,
        label: l.label,
        host: l.host,
        source: l.source,
      })),
    },
    { headers: HIT_CACHE },
  );
}

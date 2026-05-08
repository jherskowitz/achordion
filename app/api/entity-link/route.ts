import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  formatArtistCredit,
  getArtist,
  getRecording,
  getReleaseGroup,
} from "@/lib/clients/musicbrainz";

/**
 * Public read-only lookup that turns a `(type, mbid)` pair into the
 * canonical Achordion URL for that entity. Built for Parachord (and
 * any other client) that wants to render "View on Achordion" links
 * without hard-coding our URL conventions — keeps them stable as the
 * single source of truth on Achordion's side.
 *
 * Inputs:
 *   - `type`: artist | release-group | recording. Aliases:
 *     `album` → release-group, `track` → recording.
 *   - `mbid`: MusicBrainz ID for the entity.
 *   - `include` (optional, comma-separated): `names` to enrich the
 *     response with track / artist / album names (one MB API call;
 *     skipped by default to keep the lookup cheap).
 *
 * Why no auth: this is a string-formatting API (mbid + type → URL).
 * The names enrichment hits MusicBrainz, but MB itself is public and
 * we already cache/rate-limit at lib/clients/musicbrainz.ts. Public
 * read fits the rest of Achordion's API surface.
 *
 * Why not just hard-code the URL on the caller's side: we want to
 * change the convention in one place. Today `/release-group/<mbid>`
 * is the canonical album route; if that ever moved, every client
 * doing string concatenation breaks. Routing through this endpoint
 * means changing it server-side once.
 *
 * Cache: long s-maxage (URLs are stable; names rarely change).
 */

export const dynamic = "force-dynamic";

// Use CDN-Cache-Control (not plain Cache-Control) so Vercel's edge
// caches the response. Next overrides plain Cache-Control to
// `private, no-store` for any dynamic route, which this is by virtue
// of reading searchParams. See next.config.ts for the full rationale.
const CACHE_HEADERS: Record<string, string> = {
  "CDN-Cache-Control":
    "public, s-maxage=86400, stale-while-revalidate=604800",
};

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

const ACHORDION_ORIGIN = "https://achordion.xyz";

/** Public entity types we expose canonical routes for. `album` and
 *  `track` are aliases that get normalised to their canonical names. */
type EntityType = "artist" | "release-group" | "recording";

const TYPE_ALIASES: Record<string, EntityType> = {
  artist: "artist",
  "release-group": "release-group",
  album: "release-group",
  recording: "recording",
  track: "recording",
};

const QuerySchema = z.object({
  type: z
    .string()
    .min(1)
    .transform((v) => v.toLowerCase().trim())
    .refine((v): v is keyof typeof TYPE_ALIASES => v in TYPE_ALIASES, {
      message:
        "type must be one of: artist, release-group, recording (aliases: album, track)",
    }),
  // MBIDs are 36-char UUIDs — validate shape so we fail fast before
  // making any MB call.
  mbid: z.string().uuid(),
  include: z.string().optional(),
});

interface EntityLinkResponse {
  type: EntityType;
  mbid: string;
  url: string;
  /** Only present for tracks — Achordion has an iframe-friendly embed
   *  widget at /embed/track/<mbid>. Artists / albums don't (yet). */
  embed_url?: string;
  /** When `?include=names`, the entity's display name(s). Optional
   *  fields per type — `artist_name` only on recording / release-
   *  group, `album_name` only on recording. */
  name?: string;
  artist_name?: string;
  album_name?: string;
}

function canonicalUrl(type: EntityType, mbid: string): string {
  const path =
    type === "artist"
      ? `/artist/${mbid}`
      : type === "release-group"
        ? `/release-group/${mbid}`
        : `/recording/${mbid}`;
  return `${ACHORDION_ORIGIN}${path}`;
}

function embedUrl(type: EntityType, mbid: string): string | undefined {
  // Only tracks have an embed widget today. Add other entity types
  // here if/when we ship widgets for them.
  return type === "recording"
    ? `${ACHORDION_ORIGIN}/embed/track/${mbid}`
    : undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    type: url.searchParams.get("type") ?? "",
    mbid: url.searchParams.get("mbid") ?? "",
    include: url.searchParams.get("include") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const type = TYPE_ALIASES[parsed.data.type];
  const { mbid } = parsed.data;
  const includeNames = (parsed.data.include ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes("names");

  const response: EntityLinkResponse = {
    type,
    mbid,
    url: canonicalUrl(type, mbid),
    ...(embedUrl(type, mbid) ? { embed_url: embedUrl(type, mbid) } : {}),
  };

  if (includeNames) {
    try {
      if (type === "artist") {
        const artist = await getArtist(mbid);
        response.name = artist.name;
      } else if (type === "release-group") {
        const rg = await getReleaseGroup(mbid);
        response.name = rg.title;
        const credit = formatArtistCredit(rg["artist-credit"]);
        if (credit.name) response.artist_name = credit.name;
      } else {
        const recording = await getRecording(mbid);
        response.name = recording.title;
        const credit = formatArtistCredit(recording["artist-credit"]);
        if (credit.name) response.artist_name = credit.name;
        // Pick the earliest release as the canonical album, matching
        // how the recording page picks its hero album.
        const release = (recording.releases ?? [])
          .slice()
          .sort((a, b) =>
            (a.date ?? "9999").localeCompare(b.date ?? "9999"),
          )[0];
        if (release?.["release-group"]?.title) {
          response.album_name = release["release-group"].title;
        } else if (release?.title) {
          response.album_name = release.title;
        }
      }
    } catch {
      // Names enrichment is best-effort. The URL itself is always
      // valid (we only need the MBID), so a degraded response with
      // missing names beats a 502.
    }
  }

  return NextResponse.json(response, { headers: CACHE_HEADERS });
}

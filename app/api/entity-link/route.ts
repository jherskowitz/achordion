import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  formatArtistCredit,
  getArtist,
  getRecording,
  getReleaseGroup,
  MusicBrainzError,
  resolveReleaseGroupIdFromRelease,
  type ReleaseGroupDetail,
} from "@/lib/clients/musicbrainz";

/**
 * Read-only lookup that turns a `(type, mbid)` pair into the
 * canonical Achordion URL for that entity. Built for Parachord (and
 * any other client we authorize) that wants to render "View on
 * Achordion" links without hard-coding our URL conventions — keeps
 * them stable as the single source of truth on Achordion's side.
 *
 * Inputs:
 *   - `type`: artist | release-group | recording | playlist. Aliases:
 *     `album` → release-group, `track` → recording.
 *   - `mbid`: MusicBrainz ID for the entity.
 *   - `include` (optional, comma-separated): `names` to enrich the
 *     response with track / artist / album names (one MB API call;
 *     skipped by default to keep the lookup cheap).
 *
 * **Auth: bearer token, gated.** Initially behind a shared secret
 * (`ACHORDION_API_READ_TOKEN`) so we can observe usage shape before
 * opening to the public web. The data itself is non-sensitive — it's
 * just URLs derivable from MBIDs — but unbounded read traffic could
 * pile MB API calls onto the names-enrichment path and mask cost
 * patterns we want to understand first. Plan to drop the gate once
 * we have a feel for caller volume.
 *
 * Why not just hard-code the URL on the caller's side: we want to
 * change the convention in one place. Today `/release-group/<mbid>`
 * is the canonical album route; if that ever moved, every client
 * doing string concatenation breaks. Routing through this endpoint
 * means changing it server-side once.
 *
 * Cache: `private, no-store`. Auth'd responses can't be safely
 * shared at the edge without `Vary: Authorization` (and the
 * cardinality of distinct auth-keys defeats most of the cache benefit
 * anyway at our current volume). Each request runs the function and
 * the auth check.
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

const ACHORDION_ORIGIN = "https://achordion.xyz";

/** Public entity types we expose canonical routes for. `album` and
 *  `track` are aliases that get normalised to their canonical names. */
type EntityType = "artist" | "release-group" | "recording" | "playlist";

const TYPE_ALIASES: Record<string, EntityType> = {
  artist: "artist",
  "release-group": "release-group",
  album: "release-group",
  recording: "recording",
  track: "recording",
  playlist: "playlist",
};

const QuerySchema = z.object({
  type: z
    .string()
    .min(1)
    .transform((v) => v.toLowerCase().trim())
    .refine((v): v is keyof typeof TYPE_ALIASES => v in TYPE_ALIASES, {
      message:
        "type must be one of: artist, release-group, recording, playlist (aliases: album, track)",
    }),
  // MBIDs are 36-char UUIDs — validate shape so we fail fast before
  // making any MB call.
  mbid: z.string().uuid(),
  include: z.string().optional(),
});

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1].trim() ?? null;
}

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
        : type === "playlist"
          ? `/playlist/${mbid}`
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
  // Bearer-token gate. 503 when env not configured (signals to the
  // caller that this deploy doesn't accept lookups), 401 otherwise.
  // Same shape as the existing /api/track-links/submit endpoint so
  // Parachord can share auth-error handling between them.
  const expected = process.env.ACHORDION_API_READ_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "lookup endpoint not configured" },
      { status: 503, headers: NO_STORE },
    );
  }
  const presented = bearer(request);
  if (!presented || presented !== expected) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

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

  // For albums, resolve the CANONICAL release-group id up front
  // (verify-then-fallback, #107). A caller — notably Parachord — may hand us
  // a RELEASE id; returning /release-group/<release-id> would 404. Verify the
  // id is a real release group; if MB 404s it, map the release to its parent
  // group. On any other (transient) failure, keep the original id — the
  // /release-group/[mbid] page's own 404→release redirect is the safety net.
  // When the verify fetch succeeds we reuse its result for name enrichment
  // below, so names=true albums cost no extra MB call vs before.
  let canonicalMbid = mbid;
  let resolvedRg: ReleaseGroupDetail | null = null;
  if (type === "release-group") {
    try {
      resolvedRg = await getReleaseGroup(mbid);
    } catch (e) {
      if (e instanceof MusicBrainzError && e.status === 404) {
        const rgId = await resolveReleaseGroupIdFromRelease(mbid);
        if (rgId) canonicalMbid = rgId;
      }
      // Non-404 (transient MB) → fall through with the original id.
    }
  }

  const response: EntityLinkResponse = {
    type,
    mbid: canonicalMbid,
    url: canonicalUrl(type, canonicalMbid),
    ...(embedUrl(type, canonicalMbid)
      ? { embed_url: embedUrl(type, canonicalMbid) }
      : {}),
  };

  if (includeNames && type !== "playlist") {
    try {
      if (type === "artist") {
        const artist = await getArtist(canonicalMbid);
        response.name = artist.name;
      } else if (type === "release-group") {
        // Reuse the verify fetch when the id was already a valid RG;
        // otherwise fetch the resolved group (cache-wrapped, so cheap).
        const rg = resolvedRg ?? (await getReleaseGroup(canonicalMbid));
        response.name = rg.title;
        const credit = formatArtistCredit(rg["artist-credit"]);
        if (credit.name) response.artist_name = credit.name;
      } else {
        const recording = await getRecording(canonicalMbid);
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

  return NextResponse.json(response, { headers: NO_STORE });
}

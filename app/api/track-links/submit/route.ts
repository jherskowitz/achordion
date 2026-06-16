import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getRecording,
  getRelease,
  lookupRecordingMbidByIsrc,
} from "@/lib/clients/musicbrainz";
import {
  setCachedTrackLinks,
  type CachedLink,
  type LinkEntity,
} from "@/lib/track-links-store";
import {
  PARACHORD_CLIENT_HEADER,
  normalizeParachordClient,
} from "@/lib/parachord-client";

/**
 * Parachord-only endpoint for submitting MBID → external-links
 * matches it has actively confirmed by playback. Writes are merged
 * into the persistent track-links cache with `source: "parachord"`,
 * which outranks Odesli + MB on tie-breaks (Parachord proved the
 * link plays back, not just that it matched a service search).
 *
 * Auth: shared-secret token via `Authorization: Bearer <token>`,
 * sourced from `PARACHORD_TRACK_LINKS_TOKEN`. The endpoint is
 * deliberately not user-scoped — Parachord submits aggregate
 * matches it has resolved, not per-user listening data.
 *
 * Body shape:
 *   {
 *     mbid: "<recording mbid>",   // or omit and pass `isrc` instead
 *     isrc: "GBAYE0601498",       // alt key — resolved to a recording
 *                                 //   MBID server-side when `mbid` is
 *                                 //   absent (one of the two required)
 *     links: [
 *       { url: "https://open.spotify.com/track/...",
 *         label: "Spotify",
 *         host: "spotify.com" },
 *       ...
 *     ]
 *   }
 *
 * `label` and `host` are optional — when missing we derive `host`
 * from the URL and use a capitalised version of the second-level
 * domain as `label`. Lets Parachord submit minimum-viable payloads
 * without doing the platform-mapping themselves.
 *
 * `isrc` lets ISRC-only clients contribute when they have no recording
 * MBID — common during LB MBID-mapper outages, and for tracks resolved
 * straight from a streaming service (Spotify/Apple ship the ISRC for
 * free). An ISRC is an exact recording identifier, so resolving it to
 * an MBID via MusicBrainz is high-confidence (no fuzzy-search risk). A
 * miss / MB-unreachable returns 400 so the client retries — we never
 * write a placeholder.
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

// ISRC: 2-letter country + 3-char registrant + 7 digits (year + serial).
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

const SubmitSchema = z
  .object({
    // Optional when an `isrc` is supplied — see the refine below. The
    // handler resolves the recording MBID from the ISRC server-side
    // for ISRC-only clients (LB mapper outages; streaming-resolved
    // tracks that carry an ISRC but no MBID).
    mbid: z.string().min(1).max(100).optional(),
    // Exact recording identifier. Used to derive `mbid` when the
    // client didn't supply one. Normalized to upper-case; rejected if
    // malformed.
    isrc: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => ISRC_RE.test(s), "invalid ISRC")
      .optional(),
    // Which MB entity the MBID refers to. Defaults to recording for
    // back-compat with the existing track-only submission shape.
    //
    // Accepted:
    //   - `recording` (alias `track`) → cached under recording.
    //   - `release-group` (alias `album`) → cached under release-group.
    //   - `release` → resolved server-side to its parent
    //     release-group, then cached under release-group. Lets
    //     Parachord submit the specific edition it played without
    //     having to look up the rg itself; the abstract album is the
    //     right cache key since that's what the album page reads.
    entity: z
      .enum(["recording", "release-group", "track", "album", "release"])
      .optional(),
    links: z
      .array(
        z.object({
          url: z.string().url(),
          label: z.string().max(80).optional(),
          host: z.string().max(120).optional(),
        }),
      )
      .min(1)
      .max(50),
    // Optional name metadata. Parachord knows the track + artist +
    // album it just played; passing them along makes the cache entry
    // self-describing and unlocks future "search the link cache by
    // name" features. All optional — an MBID-only submit still works.
    trackName: z.string().max(500).optional(),
    artistName: z.string().max(500).optional(),
    albumName: z.string().max(500).optional(),
  })
  // Need a key to store against — an MBID directly, or an ISRC we can
  // resolve into one. (ISRC only makes sense for recordings; an ISRC
  // with entity=release-group will fail resolution downstream, which
  // is the right outcome.)
  .refine((d) => d.mbid || d.isrc, {
    message: "one of `mbid` or `isrc` is required",
  });

/**
 * Coerce the raw `entity` field into a storage-side entity
 * (`recording` | `release-group`) and the MBID we should actually
 * key on. For `release`, we look up the release in MB to get its
 * parent release-group MBID — Parachord doesn't have to know that
 * the abstract album is the right cache key.
 *
 * Returns `null` when a release lookup is requested but the MB
 * fetch fails (the caller should 400 since the submission can't be
 * stored against any meaningful key).
 */
async function resolveStorageKey(
  rawEntity: string | undefined,
  rawMbid: string,
): Promise<{ entity: LinkEntity; mbid: string } | null> {
  if (rawEntity === "release-group" || rawEntity === "album") {
    return { entity: "release-group", mbid: rawMbid };
  }
  if (rawEntity === "release") {
    try {
      const release = await getRelease(rawMbid);
      const rgMbid = release["release-group"]?.id;
      if (!rgMbid) return null;
      return { entity: "release-group", mbid: rgMbid };
    } catch {
      return null;
    }
  }
  return { entity: "recording", mbid: rawMbid };
}

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1].trim() ?? null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function defaultLabel(host: string): string {
  const parts = host.split(".");
  if (parts.length >= 2) {
    const sld = parts[parts.length - 2];
    return sld.length > 0 ? sld[0].toUpperCase() + sld.slice(1) : sld;
  }
  return host;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.PARACHORD_TRACK_LINKS_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "submission endpoint not configured" },
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

  // Contributing platform, for telemetry only (analytics / abuse triage
  // / rollout monitoring). Client-controlled, so normalized against a
  // fixed allowlist and NEVER used for authz — auth is the bearer token
  // above. Additive: absent header → "unknown", behavior unchanged.
  const client = normalizeParachordClient(
    request.headers.get(PARACHORD_CLIENT_HEADER),
  );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const { mbid: payloadMbid, isrc, links, trackName, artistName, albumName } =
    parsed.data;

  // Derive a recording MBID from the ISRC when the client didn't send
  // one. Clients frequently have an ISRC and no MBID — LB's MBID mapper
  // goes down (502 for 2+ days in June 2026), and streaming-resolved
  // tracks carry an ISRC for free (Spotify externalIds, Apple Music
  // attributes) before they ever know the MBID. ISRC is an exact
  // recording identifier, so first-result is a high-confidence key.
  const rawMbid =
    payloadMbid ?? (isrc ? await lookupRecordingMbidByIsrc(isrc) : null);
  if (!rawMbid) {
    return NextResponse.json(
      {
        error: isrc
          ? "could not resolve ISRC to a recording (not in MusicBrainz, or MusicBrainz unreachable — retry later)"
          : "one of `mbid` or `isrc` is required",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  // Resolve the storage key. Releases get redirected to their parent
  // release-group server-side so Parachord can submit whichever
  // entity it played and we cache against the abstract album.
  const stored = await resolveStorageKey(parsed.data.entity, rawMbid);
  if (!stored) {
    return NextResponse.json(
      {
        error:
          "could not resolve release MBID to a release-group (release not found or has no parent)",
      },
      { status: 400, headers: NO_STORE },
    );
  }
  const { entity, mbid } = stored;

  // Normalise + drop links we can't resolve to a host (malformed
  // URLs that snuck past the URL validator on weird inputs).
  const normalised: CachedLink[] = [];
  for (const link of links) {
    const host = link.host?.toLowerCase() ?? hostOf(link.url);
    if (!host) continue;
    normalised.push({
      url: link.url,
      label: link.label ?? defaultLabel(host),
      host,
      source: "parachord",
    });
  }
  if (normalised.length === 0) {
    return NextResponse.json(
      { error: "no resolvable links in payload" },
      { status: 400, headers: NO_STORE },
    );
  }

  // For recording submissions, resolve ISRCs so the cache writes
  // alias keys alongside the MBID key. Lets a different recording
  // MBID with the same audio (single vs album-track variants)
  // benefit from this submission without Parachord having to know
  // about every variant. Best-effort — MB unavailable just falls
  // back to MBID-only writes.
  let isrcs: string[] = [];
  if (entity === "recording") {
    try {
      const recording = await getRecording(mbid);
      isrcs = recording.isrcs ?? [];
    } catch {
      // continue without alias coverage
    }
    // Make sure the ISRC the client submitted is aliased even if MB's
    // recording.isrcs hasn't caught up to it yet (eventual consistency
    // / freshly-added ISRC). We resolved the MBID from it, so it's the
    // right audio.
    if (isrc && !isrcs.includes(isrc)) isrcs.push(isrc);
  }

  const changed = await setCachedTrackLinks(
    mbid,
    normalised,
    {
      ...(trackName ? { trackName } : {}),
      ...(artistName ? { artistName } : {}),
      ...(albumName ? { albumName } : {}),
    },
    entity,
    isrcs.length > 0 ? { isrcs } : undefined,
  );

  // Attribute the accepted contribution by platform. Structured log so
  // it's filterable in the runtime logs for rollout/abuse monitoring.
  console.log(
    `[track-links-submit] client=${client} entity=${entity} mbid=${mbid} accepted=${normalised.length} changed=${changed}`,
  );

  // Bust the edge cache for the entity's user-facing surfaces so the
  // freshly-submitted links appear without waiting out the s-maxage.
  // Only when the write actually changed the stored set — a re-submit
  // of links we already had is a no-op and shouldn't force a pointless
  // edge regeneration. `revalidatePath` is best-effort.
  if (changed) {
    try {
      if (entity === "release-group") {
        revalidatePath(`/release-group/${mbid}`);
      } else {
        revalidatePath(`/recording/${mbid}`);
        revalidatePath(`/embed/track/${mbid}`);
      }
      // The favicon rows on those pages are CLIENT islands that fetch
      // `/api/track-links?mbid=…` — a separately edge-cached response
      // (s-maxage). Revalidating only the pages leaves that API
      // response stale for up to a day, so a freshly-submitted link a
      // page doesn't server-render (e.g. SoundCloud, which MusicBrainz
      // often lacks) sits in Redis but never reaches the client. Bust
      // the API path too — the easy miss the AGENTS.md caching docs
      // call out.
      revalidatePath(`/api/track-links`);
    } catch {
      // ignore — write to Redis already succeeded.
    }
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: normalised.length,
      // Echo back the storage key we actually used. When Parachord
      // submitted a `release` MBID, this surfaces the resolved
      // release-group MBID so they can update their own cache
      // mapping if useful.
      stored_as: { entity, mbid },
      // Whether this submit actually changed the stored set. `false`
      // means every link was already present at equal/higher priority
      // (a no-op re-submit) — useful for Parachord to throttle repeat
      // submissions of unchanged data.
      changed,
      // Echo the normalized contributing platform back so the caller
      // can confirm we read its X-Parachord-Client header.
      client,
    },
    { headers: NO_STORE },
  );
}

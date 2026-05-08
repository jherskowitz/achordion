import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRecording, getRelease } from "@/lib/clients/musicbrainz";
import {
  setCachedTrackLinks,
  type CachedLink,
  type LinkEntity,
} from "@/lib/track-links-store";

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
 *     mbid: "<recording mbid>",
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
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

const SubmitSchema = z.object({
  mbid: z.string().min(1).max(100),
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
    .enum([
      "recording",
      "release-group",
      "track",
      "album",
      "release",
    ])
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

  const { mbid: rawMbid, links, trackName, artistName, albumName } =
    parsed.data;

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
  }

  await setCachedTrackLinks(
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

  // Bust the edge cache for the entity's user-facing pages so the
  // freshly-submitted links appear without waiting out the 1h
  // s-maxage. `revalidatePath` is best-effort — failures here just
  // mean users see the new links once the edge entry naturally
  // refreshes (well within stale-while-revalidate).
  try {
    if (entity === "release-group") {
      revalidatePath(`/release-group/${mbid}`);
    } else {
      revalidatePath(`/recording/${mbid}`);
      revalidatePath(`/embed/track/${mbid}`);
    }
  } catch {
    // ignore — write to Redis already succeeded.
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
    },
    { headers: NO_STORE },
  );
}

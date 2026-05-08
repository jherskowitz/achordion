import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  setCachedTrackLinks,
  type CachedLink,
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
});

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

  const { mbid, links } = parsed.data;

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

  await setCachedTrackLinks(mbid, normalised);

  return NextResponse.json(
    { ok: true, accepted: normalised.length },
    { headers: NO_STORE },
  );
}

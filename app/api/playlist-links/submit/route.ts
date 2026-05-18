import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { setPlaylistLinks, type PlaylistLink } from "@/lib/playlist-links-store";

/**
 * Parachord pushes playlist mirror-link mappings here when a local playlist
 * is synced to ListenBrainz (and potentially other providers). The keying
 * MBID is always the ListenBrainz playlist MBID — that's the cross-platform
 * anchor.
 *
 * Symmetric to /api/track-links/submit:
 *   - Bearer token auth (PARACHORD_TRACK_LINKS_TOKEN — reuses the same
 *     env var; this is one logical write contract from one writer).
 *   - Per-IP rate limit shares the announcement-event limiter as a
 *     reasonable approximation; bump to its own kind if volume warrants.
 *   - Best-effort: 200 even when Upstash isn't configured (local dev).
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

const BodySchema = z.object({
  mbid: z.string().uuid(),
  name: z.string().max(500).optional(),
  creatorName: z.string().max(200).optional(),
  trackCount: z.number().int().min(0).max(10_000).optional(),
  links: z
    .array(
      z.object({
        host: z.string().min(1).max(120),
        url: z.string().regex(/^https?:\/\//i),
        label: z.string().min(1).max(60),
      }),
    )
    .min(1)
    .max(10),
});

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1].trim() ?? null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Log every hit on this route so we can disambiguate "Parachord
  // isn't calling us" from "Parachord is calling us but auth is
  // failing" from "auth passes but the body is being rejected." A
  // single log per attempt with a short tag makes the failure mode
  // visible in `vercel logs` without needing to grep.
  const expected = process.env.PARACHORD_TRACK_LINKS_TOKEN;
  if (!expected) {
    console.warn("[pl-links] submit: endpoint not configured (PARACHORD_TRACK_LINKS_TOKEN unset)");
    return NextResponse.json(
      { ok: true, recorded: false, reason: "endpoint not configured" },
      { status: 200, headers: NO_STORE },
    );
  }
  const presented = bearer(request);
  if (!presented) {
    console.warn("[pl-links] submit: rejected (no bearer token in Authorization header)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (presented !== expected) {
    console.warn(
      `[pl-links] submit: rejected (bearer mismatch — presented ${presented.length}-char token, expected ${expected.length}-char)`,
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const limit = await checkRateLimit("announcement-event", request);
  if (!limit.ok) {
    console.warn("[pl-links] submit: rate-limited");
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn("[pl-links] submit: invalid JSON");
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    console.warn(
      `[pl-links] submit: invalid body — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const links: PlaylistLink[] = parsed.data.links.map((l) => ({
    host: l.host,
    url: l.url,
    label: l.label,
    source: "parachord" as const,
  }));

  const recorded = await setPlaylistLinks({
    mbid: parsed.data.mbid,
    name: parsed.data.name,
    creatorName: parsed.data.creatorName,
    trackCount: parsed.data.trackCount,
    links,
    updatedAt: Date.now(),
  });

  // Bust both the LB-side playlist data cache (so getPlaylist re-
  // fetches even though the playlist mirror-links aren't in that
  // call's response shape — the bust is cheap and keeps the page's
  // upstream data fresh) and the page path itself, so the new
  // "Listen on" row appears on the next visit without waiting for
  // the s-maxage=3600 / swr=86400 edge window. Mirrors the
  // track-links/submit behaviour.
  if (recorded) {
    revalidateTag(`lb:playlist:${parsed.data.mbid}`, "max");
    revalidatePath(`/playlist/${parsed.data.mbid}`);
  }

  console.log(
    `[pl-links] submit: mbid=${parsed.data.mbid} links=${links.length} recorded=${recorded}`,
  );
  return NextResponse.json({ ok: true, recorded }, { headers: NO_STORE });
}

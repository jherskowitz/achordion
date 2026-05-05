import { NextRequest, NextResponse } from "next/server";
import { tryGetLbRadio } from "@/lib/clients/listenbrainz";
import type { ParachordTrack } from "@/lib/parachord";

/**
 * Proxies LB Radio prompt → tracks for client callers that can't use
 * `tryGetLbRadio` directly (it needs the user's server-side LB token).
 *
 * Used by widgets that build a Parachord radio URL on click — they
 * need the initial track pool to inline as `tracks=` in the parachord
 * URL, so Parachord starts immediately rather than waiting on its own
 * refill round-trip.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const prompt = url.searchParams.get("prompt");
  const modeParam = url.searchParams.get("mode") ?? "easy";
  if (!prompt) {
    return NextResponse.json({ error: "missing prompt" }, { status: 400 });
  }
  const mode =
    modeParam === "medium" || modeParam === "hard" ? modeParam : "easy";

  const result = await tryGetLbRadio(prompt, mode);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const tracks: ParachordTrack[] = result.tracks.map((t) => ({
    title: t.title,
    artist: t.artistName,
    ...(t.releaseName ? { album: t.releaseName } : {}),
    ...(t.durationMs ? { duration: Math.round(t.durationMs / 1000) } : {}),
  }));

  return NextResponse.json({ tracks });
}

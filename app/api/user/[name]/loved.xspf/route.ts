import { getUserFeedback } from "@/lib/clients/listenbrainz";
import {
  tracksToXspf,
  xspfDownloadResponse,
  xspfFilenameSlug,
  type XspfTrack,
} from "@/lib/xspf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const url = new URL(request.url);
  const count = clampCount(url.searchParams.get("count"), 500, 1, 1000);

  let feedback;
  try {
    feedback = await getUserFeedback(name, { score: 1, count });
  } catch {
    return new Response("Couldn't load loved tracks", { status: 502 });
  }

  // Skip rows without track_metadata — older MSID-only loves can't
  // round-trip into XSPF without an extra metadata enrichment call.
  const tracks: XspfTrack[] = feedback
    .filter((f) => f.track_metadata)
    .map((f) => {
      const meta = f.track_metadata!;
      return {
        title: meta.track_name,
        artistName: meta.artist_name,
        releaseName: meta.release_name ?? null,
        recordingMbid:
          f.recording_mbid ??
          meta.mbid_mapping?.recording_mbid ??
          meta.additional_info?.recording_mbid ??
          null,
        releaseMbid:
          meta.mbid_mapping?.release_mbid ??
          meta.additional_info?.release_mbid ??
          null,
        durationMs: meta.additional_info?.duration_ms ?? null,
      };
    });

  const identifier = `https://${url.host}/user/${encodeURIComponent(name)}/taste`;
  const xml = tracksToXspf(
    {
      title: `${name} — Loved tracks`,
      creator: name,
      identifier,
    },
    tracks,
  );

  return xspfDownloadResponse(xml, `${xspfFilenameSlug(name)}-loved`);
}

function clampCount(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

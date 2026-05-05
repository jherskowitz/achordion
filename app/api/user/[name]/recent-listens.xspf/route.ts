import { getRecentListens } from "@/lib/clients/listenbrainz";
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
  const count = clampCount(url.searchParams.get("count"), 100, 1, 1000);

  let listens;
  try {
    listens = await getRecentListens(name, { count });
  } catch {
    return new Response("Couldn't load listens", { status: 502 });
  }

  const tracks: XspfTrack[] = listens.map((l) => ({
    title: l.track_metadata.track_name,
    artistName: l.track_metadata.artist_name,
    releaseName: l.track_metadata.release_name ?? null,
    recordingMbid:
      l.track_metadata.mbid_mapping?.recording_mbid ??
      l.track_metadata.additional_info?.recording_mbid ??
      null,
    releaseMbid:
      l.track_metadata.mbid_mapping?.release_mbid ??
      l.track_metadata.additional_info?.release_mbid ??
      null,
    durationMs: l.track_metadata.additional_info?.duration_ms ?? null,
  }));

  const identifier = `https://${url.host}/user/${encodeURIComponent(name)}/listens`;
  const xml = tracksToXspf(
    {
      title: `${name} — Recently played`,
      creator: name,
      identifier,
    },
    tracks,
  );

  return xspfDownloadResponse(
    xml,
    `${xspfFilenameSlug(name)}-recently-played`,
  );
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

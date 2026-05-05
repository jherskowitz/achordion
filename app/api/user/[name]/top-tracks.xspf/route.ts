import {
  getUserTopRecordings,
  STAT_RANGES,
  type StatRange,
} from "@/lib/clients/listenbrainz";
import {
  tracksToXspf,
  xspfDownloadResponse,
  xspfFilenameSlug,
  type XspfTrack,
} from "@/lib/xspf";

const RANGE_SET = new Set<string>(STAT_RANGES);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const url = new URL(request.url);
  const range = pickRange(url.searchParams.get("range"));
  const count = clampCount(url.searchParams.get("count"), 50, 1, 1000);

  let recordings;
  try {
    recordings = await getUserTopRecordings(name, range, count);
  } catch {
    return new Response("Couldn't load top tracks", { status: 502 });
  }

  const tracks: XspfTrack[] = recordings.map((r) => ({
    title: r.track_name,
    artistName: r.artist_name,
    releaseName: r.release_name ?? null,
    recordingMbid: r.recording_mbid ?? null,
    releaseMbid: r.release_mbid ?? null,
  }));

  const identifier = `https://${url.host}/user/${encodeURIComponent(name)}/stats?range=${range}`;
  const xml = tracksToXspf(
    {
      title: `${name} — Top tracks (${range.replace(/_/g, " ")})`,
      creator: name,
      identifier,
    },
    tracks,
  );

  return xspfDownloadResponse(
    xml,
    `${xspfFilenameSlug(name)}-top-tracks-${range}`,
  );
}

function pickRange(raw: string | null): StatRange {
  if (raw && RANGE_SET.has(raw)) return raw as StatRange;
  return "all_time";
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

import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getUserFeed, type FeedEvent } from "@/lib/clients/listenbrainz";
import {
  tracksToXspf,
  xspfDownloadResponse,
  xspfFilenameSlug,
  type XspfTrack,
} from "@/lib/xspf";

export async function GET(request: Request) {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) return new Response("Sign in", { status: 401 });
  const token = await getLbTokenForRequest();
  if (!token) {
    return new Response("Add an LB token in /settings/connections", {
      status: 412,
    });
  }

  const url = new URL(request.url);
  const excludeSelf = url.searchParams.get("exclude_self") === "1";
  const count = clampCount(url.searchParams.get("count"), 100, 1, 1000);

  const events = await getUserFeed(viewer, token, { count });
  if (events === null) {
    return new Response("Couldn't load feed", { status: 502 });
  }

  const filtered = excludeSelf
    ? events.filter((e) => (e.user_name ?? "") !== viewer)
    : events;
  const tracks = feedEventsToXspfTracks(filtered);

  const identifier = `https://${url.host}/feed${excludeSelf ? "?exclude_self=1" : ""}`;
  const xml = tracksToXspf(
    {
      title: excludeSelf
        ? `${viewer} — Feed (excluding own posts)`
        : `${viewer} — Feed`,
      creator: viewer,
      identifier,
    },
    tracks,
  );
  return xspfDownloadResponse(
    xml,
    `${xspfFilenameSlug(viewer)}-feed${excludeSelf ? "-others" : ""}`,
  );
}

/** Pull track-bearing events out of the feed and flatten to XspfTrack. */
function feedEventsToXspfTracks(events: FeedEvent[]): XspfTrack[] {
  const out: XspfTrack[] = [];
  for (const e of events) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const tm =
      (meta.track_metadata as Record<string, unknown> | undefined) ?? null;
    if (!tm) continue;
    const title = typeof tm.track_name === "string" ? tm.track_name : null;
    const artist = typeof tm.artist_name === "string" ? tm.artist_name : null;
    if (!title || !artist) continue;
    const releaseName =
      typeof tm.release_name === "string" ? tm.release_name : null;
    const additional = tm.additional_info as Record<string, unknown> | undefined;
    const mapping = tm.mbid_mapping as Record<string, unknown> | undefined;
    const recordingMbid =
      pickStr(additional?.recording_mbid) ??
      pickStr(mapping?.recording_mbid) ??
      null;
    const releaseMbid =
      pickStr(additional?.release_mbid) ??
      pickStr(mapping?.release_mbid) ??
      null;
    const durRaw = additional?.duration_ms;
    const durationMs = typeof durRaw === "number" ? durRaw : null;
    out.push({
      title,
      artistName: artist,
      releaseName,
      recordingMbid,
      releaseMbid,
      durationMs,
    });
  }
  return out;
}

function pickStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
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

import type { ParachordTrack } from "@/lib/parachord";
import type {
  Listen,
  FeedbackItem,
  PinnedRecording,
  FeedEvent,
} from "@/lib/clients/listenbrainz";

/** Convert a list of LB listens to Parachord-import track shape. */
export function listensToParachordTracks(listens: Listen[]): ParachordTrack[] {
  return listens.map((l) => {
    const m = l.track_metadata;
    const durRaw = m.additional_info?.duration_ms;
    const dur = typeof durRaw === "number" ? durRaw : null;
    return {
      title: m.track_name,
      artist: m.artist_name,
      ...(m.release_name ? { album: m.release_name } : {}),
      ...(dur ? { duration: Math.round(dur / 1000) } : {}),
    };
  });
}

/** Convert a list of LB feedback rows (loves) to Parachord-import shape. */
export function feedbackToParachordTracks(
  feedback: FeedbackItem[],
): ParachordTrack[] {
  return feedback
    .filter((f) => f.track_metadata?.track_name && f.track_metadata?.artist_name)
    .map((f) => {
      const m = f.track_metadata!;
      const durRaw = m.additional_info?.duration_ms;
    const dur = typeof durRaw === "number" ? durRaw : null;
      return {
        title: m.track_name,
        artist: m.artist_name,
        ...(m.release_name ? { album: m.release_name } : {}),
        ...(dur ? { duration: Math.round(dur / 1000) } : {}),
      };
    });
}

/** Convert a list of LB stat top-recordings to Parachord-import shape. */
export function topRecordingsToParachordTracks(
  recordings: Array<{
    track_name: string;
    artist_name: string;
    release_name?: string | null;
  }>,
): ParachordTrack[] {
  return recordings.map((r) => ({
    title: r.track_name,
    artist: r.artist_name,
    ...(r.release_name ? { album: r.release_name } : {}),
  }));
}

/**
 * Pull tracks out of feed events. Only event types that carry
 * track_metadata (e.g. recording_pin, recording_recommendation) yield
 * a track; follows / notifications / etc. are silently skipped.
 */
export function feedEventsToParachordTracks(
  events: FeedEvent[],
): ParachordTrack[] {
  const out: ParachordTrack[] = [];
  for (const e of events) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const tm =
      (meta.track_metadata as Record<string, unknown> | undefined) ?? null;
    if (!tm) continue;
    const title = typeof tm.track_name === "string" ? tm.track_name : null;
    const artist = typeof tm.artist_name === "string" ? tm.artist_name : null;
    if (!title || !artist) continue;
    const album =
      typeof tm.release_name === "string" ? tm.release_name : null;
    const additional = tm.additional_info as
      | Record<string, unknown>
      | undefined;
    const durRaw = additional?.duration_ms;
    const dur = typeof durRaw === "number" ? Math.round(durRaw / 1000) : null;
    out.push({
      title,
      artist,
      ...(album ? { album } : {}),
      ...(dur ? { duration: dur } : {}),
    });
  }
  return out;
}

/** Convert a list of LB pinned recordings to Parachord-import shape. */
export function pinsToParachordTracks(
  pins: PinnedRecording[],
): ParachordTrack[] {
  return pins.map((p) => {
    const m = p.track_metadata;
    const durRaw = m.additional_info?.duration_ms;
    const dur = typeof durRaw === "number" ? durRaw : null;
    return {
      title: m.track_name,
      artist: m.artist_name,
      ...(m.release_name ? { album: m.release_name } : {}),
      ...(dur ? { duration: Math.round(dur / 1000) } : {}),
    };
  });
}

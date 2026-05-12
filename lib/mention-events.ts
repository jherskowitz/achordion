import "server-only";

import { getMentionsForUser } from "@/lib/mention-index";
import { isFeatureEnabled } from "@/lib/flags";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

/**
 * Synthetic feed event type for "you were @-mentioned in a pin."
 * Same shape as the existing `bsky_friend_linked` /
 * `loved_recording` synthetics — `<FeedEventList>` branches on
 * `event_type` so the merge / sort / cap logic stays one path.
 */
export const MENTION_EVENT_TYPE = "mention";

export interface MentionEventMeta {
  /** Pin row id — also stable React key. */
  row_id: number;
  /** LB username of the pin author. */
  from_user: string;
  /** Recording MBID of the pinned track (when available). */
  recording_mbid: string | null;
  track_name: string | null;
  artist_name: string | null;
  /** Pin's blurb verbatim — the renderer parses @ mentions
   *  again at display time so links stay clickable. */
  blurb: string;
}

/**
 * Pull recent @-mention events for `viewer` from the mention
 * index and shape them as FeedEvent so they merge cleanly with
 * LB-native events.
 *
 * Stateless from the LB side — every entry comes from a pin
 * that's publicly visible at LB anyway. The `mentions` flag
 * scopes this surface for kill-switch / rollout control.
 */
export async function getMentionEvents(
  viewer: string,
  sinceUnix: number | null,
): Promise<FeedEvent[]> {
  if (!viewer) return [];
  if (!(await isFeatureEnabled("mentions", viewer))) return [];
  const since = sinceUnix ?? 0;
  const events = await getMentionsForUser(viewer, since);
  return events.map((e) => ({
    event_type: MENTION_EVENT_TYPE,
    created: e.created,
    user_name: e.fromUser,
    // Row id from the original pin so the React key is stable
    // and merge-dedupe is well-defined.
    id: e.rowId,
    metadata: {
      row_id: e.rowId,
      from_user: e.fromUser,
      recording_mbid: e.recordingMbid,
      track_name: e.trackName,
      artist_name: e.artistName,
      blurb: e.blurb,
    } satisfies MentionEventMeta,
  }));
}

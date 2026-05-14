import "server-only";

import { getListenAlongEventsForViewer } from "@/lib/listen-along-index";
import { isFeatureEnabled } from "@/lib/flags";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

/**
 * Synthetic feed event for "user X is listening along with Y in
 * Parachord." Mirrors the existing `loved_recording`, `mention`,
 * `bsky_friend_linked` synthetic event shape so `<FeedEventList>`
 * can dispatch on `event_type` the same way it does for the others.
 *
 * The event is recorded server-side when an actor clicks the
 * "Listen along" affordance on a target user's on-air pill AND
 * Parachord's desktop app is confirmed running on the client (the
 * beacon is gated on `useParachordPresence`). No event = no
 * Parachord = no actual listen-along happening.
 */
export const LISTEN_ALONG_EVENT_TYPE = "listen_along";

export interface ListenAlongEventMeta {
  /** LB username of the listener (the click actor). */
  from_user: string;
  /** LB username being listened along with. */
  to_user: string;
}

/**
 * Pull listen-along events relevant to `viewer`:
 *   - Events where the actor is in the viewer's `following` list
 *     (so the viewer sees what people they follow are tuning into).
 *   - Events where the viewer is the target (someone tuned into
 *     their stream).
 *
 * Caller supplies `following` to avoid a duplicate LB roundtrip —
 * the feed page already has it in scope from the loved-events merge.
 * Gated by `listen-along-events` flag for kill-switch / rollout.
 */
export async function getListenAlongEvents(
  viewer: string,
  following: string[],
  sinceUnix: number | null,
): Promise<FeedEvent[]> {
  if (!viewer) return [];
  if (!(await isFeatureEnabled("listen-along-events", viewer))) return [];
  const since = sinceUnix ?? 0;
  const events = await getListenAlongEventsForViewer(viewer, following, since);
  return events.map((e) => ({
    event_type: LISTEN_ALONG_EVENT_TYPE,
    created: e.created,
    user_name: e.fromUser,
    // Synthetic id — actor + target + created uniquely identifies
    // the event and keeps the React key stable across re-renders.
    // `id` on FeedEvent is `number | null | undefined`; convert the
    // composite to a hash-ish number so dedupe/sort logic that
    // treats id numerically stays well-defined.
    id: hashEventKey(e.fromUser, e.toUser, e.created),
    metadata: {
      from_user: e.fromUser,
      to_user: e.toUser,
    } satisfies ListenAlongEventMeta,
  }));
}

/**
 * djb2-style string hash truncated into a positive 32-bit int.
 * Good enough for React-key + dedupe-id purposes; not used for
 * security or storage. Two events with the same (from, to, created)
 * always produce the same id.
 */
function hashEventKey(from: string, to: string, created: number): number {
  const s = `${from.toLowerCase()}|${to.toLowerCase()}|${created}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

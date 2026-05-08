import "server-only";

import {
  getUserFeedback,
  getUserPins,
  LOVED_RECORDING_EVENT_TYPE,
  type FeedEvent,
} from "@/lib/clients/listenbrainz";

/**
 * Build a public "activity feed" for a single LB user from the public
 * endpoints we have access to. The native `/user/<name>/feed/events`
 * endpoint is private (token-owner only), so we synthesise a feed
 * from the pieces we CAN see for any user:
 *
 *   - `recording_pin` events from `getUserPins`
 *   - `loved_recording` events (synthetic, see
 *     `LOVED_RECORDING_EVENT_TYPE`) from `getUserFeedback({ score:1 })`
 *
 * The returned shape matches the FeedEvent type the existing
 * `<FeedEventList>` already renders, so the user-page activity card
 * gets the same look as the personal feed without a parallel
 * renderer.
 *
 * `since` is a Unix timestamp (seconds, matching LB's own format) —
 * events older than that are dropped. Use this with `now - 30*86400`
 * to gate "show this section only when there's recent activity."
 */

const PIN_EVENT_TYPE = "recording_pin";

export interface UserActivityFeedOptions {
  /** Drop events with `created < since` (Unix seconds). */
  since?: number;
  /** Per-source fetch limit (pins, loves) before the merge. */
  perSourceCount?: number;
  /** Cap on the merged + sorted output. */
  limit?: number;
}

export async function getUserActivityFeed(
  userName: string,
  opts: UserActivityFeedOptions = {},
): Promise<FeedEvent[]> {
  const since = opts.since ?? 0;
  const perSourceCount = opts.perSourceCount ?? 25;
  const limit = opts.limit ?? 25;

  const [pins, loves] = await Promise.all([
    getUserPins(userName, perSourceCount).catch(() => []),
    getUserFeedback(userName, { score: 1, count: perSourceCount }).catch(
      () => [],
    ),
  ]);

  const events: FeedEvent[] = [];

  for (const p of pins) {
    if (p.created < since) continue;
    events.push({
      id: null,
      created: p.created,
      event_type: PIN_EVENT_TYPE,
      user_name: userName,
      metadata: {
        track_metadata: p.track_metadata,
        blurb_content: p.blurb_content ?? null,
      },
    });
  }
  for (const f of loves) {
    if (f.created < since) continue;
    events.push({
      id: null,
      created: f.created,
      event_type: LOVED_RECORDING_EVENT_TYPE,
      user_name: userName,
      metadata: {
        track_metadata: f.track_metadata ?? null,
        recording_mbid: f.recording_mbid ?? null,
      },
    });
  }

  return events
    .sort((a, b) => b.created - a.created)
    .slice(0, limit);
}

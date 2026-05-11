import "server-only";

import { getBskyLink } from "@/lib/bsky-link";
import { findBlueskyFriends, type BskyFriendMatch } from "@/lib/bsky-display";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

/**
 * Synthetic event type emitted for "your Bluesky friend X just
 * linked their Achordion profile" rows in the feed. Mirrors the
 * pattern used by `LOVED_RECORDING_EVENT_TYPE` — same `FeedEvent`
 * shape, branched on `event_type` in `<FeedEventList>` so the
 * merge / sort / cap logic stays one code path.
 */
export const BSKY_FRIEND_LINKED_EVENT_TYPE = "bsky_friend_linked";

/**
 * Metadata payload we stuff into the synthetic FeedEvent. The
 * renderer reads these fields to draw the card. All Bluesky-side
 * data is the live profile we already fetched via
 * `findBlueskyFriends` — Achordion stores none of it.
 */
export interface BskyFriendLinkedMeta {
  bsky_handle: string;
  bsky_display_name?: string;
  bsky_avatar?: string;
}

/**
 * Compute the list of "your Bluesky friend X linked Achordion"
 * events visible to a viewer, scoped to those that happened after
 * `sinceUnix` (unix seconds — matches LB's `created` shape so the
 * caller can pass `lastSeenTs` from the feed-seen cookie directly).
 *
 * Stateless: walks the viewer's Bluesky follow graph (cached) plus
 * one Redis MGET on `bsky-link-by-did:*` to find matches, then a
 * `GET bsky-link:<name>` per match to read each friend's
 * `verified_at` timestamp. Filters to friends who linked after
 * `sinceUnix`. No new event storage.
 *
 * Returns an empty array when:
 *   - the viewer hasn't linked their own Bluesky (handled inside
 *     `findBlueskyFriends`),
 *   - the bsky-link feature flag is off for the viewer,
 *   - no matched friends linked in the time window.
 *
 * `created` on the synthesised event is each friend's
 * `verified_at` (ms → unix seconds) so the feed-wide sort-by-
 * `created`-desc puts these in the right slot among LB events.
 */
export async function getBskyFriendLinkEvents(
  viewer: string,
  sinceUnix: number | null,
): Promise<FeedEvent[]> {
  const friends = await findBlueskyFriends(viewer);
  if (friends.length === 0) return [];

  // Resolve `verified_at` per matched friend. One `GET bsky-link:*`
  // per match — each match represents someone the viewer follows on
  // Bluesky who's also linked Achordion. In practice the matched
  // set is small (handful to dozens), so an N round-trip read here
  // is fine; we can swap for a pipelined `mget` if it ever grows.
  const enriched = await Promise.all(
    friends.map(async (f: BskyFriendMatch) => {
      const link = await getBskyLink(f.lbUsername);
      if (!link) return null;
      // verified_at is stored as milliseconds (Date.now()); LB feed
      // events use unix seconds. Normalise here so the merge sort
      // works against either source.
      const createdSec = Math.floor(link.verified_at / 1000);
      if (sinceUnix !== null && createdSec <= sinceUnix) return null;
      return { friend: f, createdSec };
    }),
  );

  return enriched
    .filter((x): x is { friend: BskyFriendMatch; createdSec: number } => !!x)
    .map(({ friend, createdSec }) => ({
      event_type: BSKY_FRIEND_LINKED_EVENT_TYPE,
      created: createdSec,
      user_name: friend.lbUsername,
      // Stable per-friend id so React keys are deterministic across
      // renders and dedupe works when multiple feed sources are
      // merged. Prefixed with the event type to avoid collisions
      // with LB's numeric row ids.
      id: null,
      metadata: {
        bsky_handle: friend.bskyHandle,
        bsky_display_name: friend.bskyDisplayName,
        bsky_avatar: friend.bskyAvatar,
      } satisfies BskyFriendLinkedMeta,
    }));
}

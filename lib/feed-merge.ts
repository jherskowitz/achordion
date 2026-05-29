import "server-only";

import {
  getFollowing,
  getLovedRecordingEvents,
  getUserFeed,
  type FeedEvent,
} from "@/lib/clients/listenbrainz";
import { getBskyFriendLinkEvents } from "@/lib/bsky-friend-events";
import { getMentionEvents } from "@/lib/mention-events";
import { getListenAlongEvents } from "@/lib/listen-along-events";
import { getPlaylistPublishedEvents } from "@/lib/playlist-events";
import { getReviewEvents } from "@/lib/review-events";

/**
 * Shared merge pipeline for the /feed page and the
 * `/api/me/feed` polling endpoint.
 *
 * The page calls this once per render to produce the initial set
 * that seeds the client island. The polling endpoint calls it on
 * every poll and filters by `since` so the client only receives
 * events newer than what it's already painted.
 *
 * Both surfaces share the same merge / dedupe / sort behaviour, so
 * the polling response is a strict superset of the page render —
 * an event the page didn't show will never appear via polling, and
 * vice versa.
 */

export type FeedMergeError = "no-token" | "lb-down";

export interface FeedMergeResult {
  /** Merged + deduped + sorted (newest first) events, sliced to
   *  `limit`. Empty array on `error !== null`. */
  events: FeedEvent[];
  /** `null` on success. `"no-token"` when the viewer hasn't added
   *  an LB token in Settings. `"lb-down"` when LB's feed endpoint
   *  returned an error response. The synthetic sources keep
   *  contributing on `"lb-down"`, so a partial render is still
   *  possible — the caller decides whether to surface the error or
   *  fall through. */
  error: FeedMergeError | null;
}

export interface FeedMergeOptions {
  /** Final cap on event count after merge + sort. Page uses 50;
   *  polling can use a smaller cap since it's only fetching deltas. */
  limit?: number;
  /** When set, drop events authored by the viewer themselves. Same
   *  semantics as the page's "Hide my own" filter. */
  excludeSelf?: boolean;
  /** When set, drop events older than or equal to this unix-seconds
   *  timestamp. Polling endpoint uses this to return deltas only. */
  sinceUnix?: number;
}

/**
 * Fetch every source, merge, dedupe, sort, slice. Self-contained:
 * caller passes `viewer` (the LB username) and the viewer's LB
 * token. Returns events newest-first.
 */
export async function mergeFeedEvents(
  viewer: string,
  token: string,
  opts: FeedMergeOptions = {},
): Promise<FeedMergeResult> {
  const limit = opts.limit ?? 50;
  const excludeSelf = opts.excludeSelf ?? false;
  const sinceUnix = opts.sinceUnix;
  if (!viewer || !token) return { events: [], error: "no-token" };

  // Resolve the viewer's `following` list once and share across the
  // three readers that need it (loved-recording fan-out, listen-
  // along, playlist-published, CB reviews). Without this all four
  // would each call getFollowing in parallel — same data, four
  // round-trips.
  const followingPromise = getFollowing(viewer).catch(() => [] as string[]);

  // Guarantee no single source can wedge the whole merge. Each is
  // already wrapped in a .catch — the timeout race covers the case
  // where a promise just hangs (LB sometimes accepts a request and
  // then sits on it past Vercel's function timeout). 20s leaves
  // plenty of headroom under the platform's 60s cap while still
  // letting the page show *something* even on a flaky upstream.
  function withTimeout<T>(p: Promise<T>, fallback: T, ms = 20_000): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  }

  const [
    nativeEvents,
    lovedEvents,
    bskyFriendEvents,
    mentionEvents,
    listenAlongEvents,
    playlistPublishedEvents,
    reviewEvents,
  ] = await Promise.all([
    withTimeout(
      getUserFeed(viewer, token, { count: limit }).catch(
        () => null as Awaited<ReturnType<typeof getUserFeed>>,
      ),
      null,
    ),
    withTimeout(
      followingPromise.then((following) => {
        const targets = [viewer, ...following.filter((u) => u !== viewer)];
        return getLovedRecordingEvents(targets).catch(
          () => [] as FeedEvent[],
        );
      }),
      [] as FeedEvent[],
    ),
    withTimeout(
      getBskyFriendLinkEvents(viewer, null).catch(() => [] as FeedEvent[]),
      [] as FeedEvent[],
    ),
    withTimeout(
      getMentionEvents(viewer, null).catch(() => [] as FeedEvent[]),
      [] as FeedEvent[],
    ),
    withTimeout(
      followingPromise.then((following) =>
        getListenAlongEvents(viewer, following, null).catch(
          () => [] as FeedEvent[],
        ),
      ),
      [] as FeedEvent[],
    ),
    withTimeout(
      followingPromise.then((following) =>
        getPlaylistPublishedEvents(viewer, following, null).catch(
          () => [] as FeedEvent[],
        ),
      ),
      [] as FeedEvent[],
    ),
    withTimeout(
      followingPromise.then((following) =>
        getReviewEvents([
          viewer,
          ...following.filter((u) => u !== viewer),
        ]).catch(() => [] as FeedEvent[]),
      ),
      [] as FeedEvent[],
    ),
  ]);

  // LB native feed sometimes returns null on transient outage; the
  // synthetic side keeps working in that case. Surface the error
  // for the caller's UI choice but still build a partial merge.
  const error: FeedMergeError | null = nativeEvents === null ? "lb-down" : null;
  const events = nativeEvents ?? [];

  // Dedupe review events against LB-native: if LB included the
  // same review in its own window, we prefer the LB entry (it's the
  // canonical source for the renderer's metadata). Match by
  // `review_mbid` on metadata — the CB review UUID is stable across
  // both sources.
  const seenReviewIds = new Set<string>();
  for (const e of events) {
    if (
      (e.event_type === "review" || e.event_type === "critiquebrainz_review") &&
      typeof (e.metadata as { review_mbid?: string } | undefined)
        ?.review_mbid === "string"
    ) {
      seenReviewIds.add(
        (e.metadata as { review_mbid: string }).review_mbid,
      );
    }
  }
  const dedupedReviewEvents = reviewEvents.filter((e) => {
    const id = (e.metadata as { review_mbid?: string } | undefined)
      ?.review_mbid;
    return !id || !seenReviewIds.has(id);
  });

  const viewerLc = viewer.toLowerCase();
  const merged = [
    ...events,
    ...lovedEvents,
    ...bskyFriendEvents,
    ...mentionEvents,
    ...listenAlongEvents,
    ...playlistPublishedEvents,
    ...dedupedReviewEvents,
  ];

  let filtered = merged.sort((a, b) => b.created - a.created);
  if (typeof sinceUnix === "number") {
    filtered = filtered.filter((e) => e.created > sinceUnix);
  }
  if (excludeSelf) {
    filtered = filtered.filter(
      (e) => (e.user_name ?? "").toLowerCase() !== viewerLc,
    );
  }

  return { events: filtered.slice(0, limit), error };
}

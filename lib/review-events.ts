import "server-only";

import {
  getCbReviewsByUserId,
  getCbUserIdByMbUsername,
} from "@/lib/clients/critiquebrainz";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

/**
 * Synthetic feed event for "user X reviewed Y on CritiqueBrainz."
 *
 * Background: LB's `/user/<name>/feed/events` endpoint emits a
 * `review` event_type for CB reviews from followed users, but
 * caps the response to the most recent ~50 events across ALL
 * event types. On a feed dense with listens / pins / loves, a
 * review from three weeks ago gets pushed off the bottom of the
 * window. Same problem we already paper over for loves with
 * `getLovedRecordingEvents()` — fan out per followed user and
 * splice the missing entries back in.
 *
 * The dispatch in `<FeedEventList>` already handles `review` (see
 * the `CritiqueBrainzReviewEvent` renderer + cover-art batch
 * resolver) — we just need to feed it events. Shaped identically
 * to what LB would have sent so the renderer doesn't need a
 * separate branch.
 */
export const REVIEW_EVENT_TYPE = "review";

/** Max reviews to splice in per followed user. CB's API will go up
 *  to 50; 5 is plenty for the feed merge to find the freshest one. */
const REVIEWS_PER_USER = 5;
/** Cap on parallel CB fan-out — same shape as the loved-recording
 *  fan-out's maxUsers. Bounds per-render cost for users with very
 *  large follow lists. */
const MAX_USERS = 50;

/**
 * Fan out over `following` to fetch each user's recent CB reviews
 * and emit them as synthetic FeedEvent entries. Caller merges into
 * the feed page alongside the native LB feed + the other synthetic
 * sources.
 *
 * Per-user steady-state cost is two cache hits (CB user-id lookup
 * cached 30d, reviews-by-user cached 1h). Cold-cache fans out N
 * parallel calls; bounded by MAX_USERS for large follow lists.
 */
export async function getReviewEvents(
  following: string[],
): Promise<FeedEvent[]> {
  if (following.length === 0) return [];
  const targets = following.slice(0, MAX_USERS);
  const fanOut = await Promise.all(
    targets.map(async (mbUsername) => {
      const userId = await getCbUserIdByMbUsername(mbUsername).catch(
        () => null,
      );
      if (!userId) return [] as Array<{ mbUsername: string; r: ReviewItem }>;
      const reviews = await getCbReviewsByUserId(userId, REVIEWS_PER_USER);
      return reviews.map((r) => ({ mbUsername, r }));
    }),
  );
  const events: FeedEvent[] = [];
  for (const chunk of fanOut) {
    for (const { mbUsername, r } of chunk) {
      // Shape matches what LB emits for `review` events so the
      // existing renderer (CritiqueBrainzReviewEvent) and cover-
      // resolver (resolveReviewCovers) work without a branch.
      // entity_name isn't included — CB's review payload doesn't
      // carry it. The renderer falls back to "an entity" today; a
      // follow-up could batch-resolve names via MB but the link
      // already targets the right entity page so click-through is
      // already correct.
      events.push({
        event_type: REVIEW_EVENT_TYPE,
        created: r.publishedTs,
        user_name: mbUsername,
        // Stable id for React keys; reviewId is unique per CB write.
        id: hashReviewId(r.reviewId),
        metadata: {
          entity_id: r.entityId,
          entity_type: r.entityType ?? undefined,
          rating: r.rating,
          text: r.text,
          review_mbid: r.reviewId,
          user_name: mbUsername,
        },
      });
    }
  }
  return events;
}

type ReviewItem = Awaited<
  ReturnType<typeof getCbReviewsByUserId>
>[number];

function hashReviewId(reviewId: string): number {
  let h = 5381;
  for (let i = 0; i < reviewId.length; i++) {
    h = ((h << 5) + h + reviewId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

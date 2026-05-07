import { AlbumReviewsClient } from "./album-reviews-client";

/**
 * Server-component shell for the album Reviews block.
 *
 * The actual rendering lives in `AlbumReviewsClient` because reviews
 * are gated by per-user feature flags (`isFeatureEnabledForViewer`)
 * + read the session cookie — content that can't share a CDN edge
 * cache. The host route (`/release-group/[mbid]`) stays edge-cached
 * for the public surface; this island fetches the per-user payload
 * post-hydration via `/api/release-group/[mbid]/reviews`.
 *
 * `urls` is no longer needed here — the API route re-derives all
 * required state from the mbid alone — but the prop is kept for
 * backwards-compatibility with existing call sites.
 */
export function AlbumReviews({ mbid }: { mbid: string }) {
  return <AlbumReviewsClient mbid={mbid} />;
}

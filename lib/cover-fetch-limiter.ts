import { createAsyncLimiter } from "./async-limiter";

/**
 * Page-wide cap on simultaneous `/api/track-cover` requests.
 *
 * A long tracklist / chart grid can mount dozens of lazy cover tiles at
 * once; even with in-view gating, a fast scroll-through can reveal many
 * rows in quick succession. This module-level limiter (one per browser
 * tab) keeps at most N cover lookups in flight so we don't open dozens
 * of connections at once and pile onto MB's 1-req/sec queue — the rest
 * queue client-side and start as slots free. Pairs with the route's
 * `withLookupDeadline` bound: each call returns fast (cover or
 * placeholder), and the limiter controls how many run together.
 */
export const COVER_FETCH_CONCURRENCY = 6;

export const limitCoverFetch = createAsyncLimiter(COVER_FETCH_CONCURRENCY);

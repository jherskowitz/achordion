/**
 * A 302 redirect the Vercel edge can cache.
 *
 * The entity-link lookup routes (`/artist/lookup`, `/release-group/lookup`,
 * `/recording/lookup`) blanket every chart/explore page and resolve a
 * stable `(name → MBID)` mapping via a MusicBrainz search before redirecting.
 * `Response.redirect()` sets no Cache-Control, so EVERY hit re-runs that MB
 * search — and a crawler re-walking a chart page's ~30–60 entity links turns
 * into a burst of redirect responses + MB searches + 429s + CPU (observed as
 * periodic spikes in Vercel Observability).
 *
 * A resolved lookup is effectively immutable, so cache the matched redirect
 * long: a repeat hit of the same lookup URL (a re-crawl, or any second user)
 * is served from the edge with no function invocation and no MB call. The
 * `/search` fallback caches briefly, since a no-match today may resolve once
 * MB's data or our mapping catches up.
 */
export function cachedRedirect(
  to: URL | string,
  { matched }: { matched: boolean },
): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: to.toString(),
      "Cache-Control": matched
        ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400"
        : "public, max-age=60, s-maxage=600",
    },
  });
}

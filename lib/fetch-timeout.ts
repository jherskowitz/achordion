/**
 * `fetch` with a hard wall-clock timeout.
 *
 * Why this exists: an outbound `fetch()` with no timeout can hang
 * indefinitely when the upstream is slow or unresponsive. When that
 * fetch sits in a server-component render path (directly, or inside a
 * Suspense boundary), the hang wedges the whole render — the page sits
 * on its skeleton forever and, on CDN-cached routes, the origin render
 * never completes. A try/catch does NOT save you: a hang is never a
 * rejection, so `.catch(() => fallback)` only rescues real errors.
 *
 * This session hit that failure mode three separate times (MusicBrainz,
 * ListenBrainz, Odesli — release-group page + pinned-track favicons).
 * Every outbound HTTP client now routes through here so a single slow
 * third party can never hang a render again.
 *
 * `AbortSignal.timeout(ms)` aborts the fetch after `ms`, turning the
 * hang into a `TimeoutError` rejection the caller's existing error
 * handling already deals with. Respects an explicit `signal` if the
 * caller passed one (we don't clobber a caller's own abort).
 *
 * Note on caching: the abort signal does NOT defeat Next's fetch cache.
 * A cache hit returns before the timer matters; the signal only bounds
 * the live upstream call on a cache miss.
 */

/** Default ceiling. Generous enough that a healthy upstream never trips
 *  it, tight enough that a hung one can't outlive a serverless function
 *  invocation. Per-call override available for known-slow services. */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  // Don't override a caller-supplied signal — they've opted into their
  // own abort control.
  if (init.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

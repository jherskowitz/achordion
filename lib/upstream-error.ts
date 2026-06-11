/**
 * Map an upstream client error (ListenBrainz / MusicBrainz fetch
 * failure) to a short, user-facing sentence.
 *
 * The clients throw with the raw status + response body in the message
 * (e.g. `LB 429: {"code":429,"error":"You have exceeded your rate
 * limit. …"}`). Rendering that straight into the UI leaks an ugly JSON
 * blob to the user — this normalizes it to friendly copy and, crucially,
 * never echoes the raw status/body. Pure + dependency-free so it can run
 * in client components and be unit-tested.
 */
export function friendlyListenBrainzError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  // Rate limit (429) — the common one when ListenBrainz throttles us.
  if (/\b429\b/.test(msg) || /rate.?limit/i.test(msg)) {
    return "ListenBrainz is rate-limiting us right now. Give it a minute and try again.";
  }
  // Upstream 5xx / timeout / aborted deadline — service hiccup.
  if (/\b5\d\d\b/.test(msg) || /\b(timeout|timed out|deadline|abort(?:ed)?|exceeded)\b/i.test(msg)) {
    return "ListenBrainz isn't responding right now. Try again shortly.";
  }
  return "Couldn't reach ListenBrainz. Try again in a moment.";
}

/**
 * Slider value (0–100, step 10) → listen-count threshold for the
 * Recommended Artists / Recommended Tracks rails on Explore.
 *
 * Lives in /lib (not the slider component) because it's needed by
 * both sides of the boundary: the server-rendered explore page
 * computes the exclude set from this, and the client-side
 * <FamiliaritySlider> renders the human-readable description from
 * it. A "use client" file can't be imported as a plain function on
 * the server, so the math belongs in a shared, side-effect-free
 * module.
 *
 * Returns null when no exclusion should be applied. Otherwise
 * returns the listen-count threshold above which an artist or
 * recording is considered "familiar" and gets filtered out of
 * recommendations.
 *
 * Eleven buckets across the slider range — each notch produces a
 * meaningfully different threshold so the user sees the list shift
 * on every nudge.
 */
const BUCKETS: (number | null)[] = [
  null, // 0  — no exclusion
  200, //  10
  100, //  20
  50, //   30
  25, //   40
  10, //   50 (default)
  5, //    60
  3, //    70
  2, //    80
  1, //    90
  0, //   100 — exclude every artist/track ever played
];

export function thresholdFromFamiliarity(v: number): number | null {
  const i = Math.round(v / 10);
  const clamped = Math.max(0, Math.min(BUCKETS.length - 1, i));
  return BUCKETS[clamped];
}

export function describeFamiliarity(
  v: number,
  kind: "artist" | "track" = "artist",
): string {
  const t = thresholdFromFamiliarity(v);
  if (t === null) return `Show ${kind}s I already listen to a lot.`;
  if (t === 0) return `Hide every ${kind} I've ever listened to.`;
  return `Hide ${kind}s I've listened to more than ${t} time${t === 1 ? "" : "s"}.`;
}

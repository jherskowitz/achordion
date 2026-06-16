/**
 * Familiarity slider (0–100, step 10) helpers for the Recommended
 * Artists / Recommended Tracks rails on Explore. Familiar (0) ↔
 * Discoveries (100).
 *
 * Lives in /lib because both sides of the RSC boundary need it: the
 * server-rendered explore page filters with these, and the client
 * <FamiliaritySlider> renders the description from the same source.
 * Side-effect-free, no server-only imports, so it's safe in either.
 *
 * Two axes, because the reliable signal differs between the rails:
 *   - Tracks graduate by RECENCY of listening (`filterByRecency`).
 *     LB's per-recommendation `latest_listened_at` is the trustworthy
 *     "have I heard this" signal; recording-MBID matches against the
 *     user's listen history are NOT (see the track-links docs), so a
 *     play-count filter leaks most already-heard tracks back in. A
 *     timestamp also gives an ordering a play-count binary can't.
 *   - Artists graduate by play-RANK percentile (see
 *     `buildExcludedArtistSet`). Absolute play-count thresholds
 *     saturate for heavy listeners — most of their artists clear any
 *     small threshold, so the discovery half of the slider is dead —
 *     whereas a percentile of the user's own distribution keeps the
 *     full range live.
 */

/** Clamp a raw slider value to [0, 100]. */
export function clampFamiliarity(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/**
 * Filter recommendation rows by how recently the viewer last heard
 * each one.
 *
 *   - `familiarity` 0 keeps everything (most familiar).
 *   - 100 keeps only rows the viewer has never heard (pure discovery).
 *   - In between, hides the most-recently-heard `familiarity`% of the
 *     HEARD rows; never-heard rows are always kept (maximally
 *     "discovery").
 *
 * Pure + generic so both rec rails share it. Relies only on each row's
 * `latest_listened_at` (LB's reliable per-rec signal), so it graduates
 * smoothly across the whole slider without a second listen-history
 * fetch.
 */
export function filterByRecency<T extends { latest_listened_at: string | null }>(
  rows: T[],
  familiarity: number,
): T[] {
  const fam = clampFamiliarity(familiarity);
  if (fam <= 0) return rows;
  const heard = rows
    .map((r) => parseListenedAt(r.latest_listened_at))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b); // oldest first
  if (heard.length === 0) return rows; // nothing heard → all discoverable
  const hideCount = Math.round((fam / 100) * heard.length);
  if (hideCount <= 0) return rows;
  // Everything last heard at or after this timestamp is "recent" → hidden.
  const cutoff = heard[heard.length - hideCount];
  return rows.filter((r) => {
    const t = parseListenedAt(r.latest_listened_at);
    if (t === null) return true; // never heard → keep
    return t < cutoff; // heard long ago → keep; recently → drop
  });
}

function parseListenedAt(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function describeFamiliarity(
  v: number,
  kind: "artist" | "track" = "artist",
): string {
  const fam = clampFamiliarity(v);
  if (fam <= 0) return `Show ${kind}s I already listen to a lot.`;
  const verb = kind === "track" ? "heard" : "played";
  if (fam >= 100) return `Hide every ${kind} I've ever ${verb}.`;
  return kind === "track"
    ? `Hide the ${fam}% of tracks I've heard most recently.`
    : `Hide my top ${fam}% most-played artists.`;
}

/**
 * Pure key-construction helpers for the track-links store.
 *
 * Kept free of `server-only` / Upstash / next imports so the same
 * logic can be exercised in a plain node script (the repo has no unit
 * runner — see the one-off test alongside this in code review) and
 * reused identically on the read and write paths. Identical
 * normalization on both sides is the whole correctness requirement
 * for the name-alias bridge, so it lives in one place.
 */

/**
 * Normalize an artist or title string for use in a name-alias key.
 *
 * Goal: two spellings of the SAME recording's name collapse to one
 * key, while genuinely different titles stay distinct.
 *   - NFC so combining vs precomposed accents match.
 *   - lowercase so case differences collapse.
 *   - whitespace runs → single space, then trim.
 *
 * Deliberately does NOT strip parenthetical extra-title-information
 * ("(live)", "(demo)", "(radio edit)", "(… remix)"). MusicBrainz
 * style puts those qualifiers in the title, so keeping them means a
 * live / demo / remix recording produces a DIFFERENT key from the
 * studio recording and never inherits its streaming links. The ETI
 * is the safety mechanism that makes an exact-name bridge safe —
 * stripping it would defeat the point.
 */
export function normalizeNameForKey(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Build the name-alias key for a recording's (artist, title). Returns
 * null when either component normalizes to empty — we never want to
 * write or read a key that would collapse every nameless entry into
 * one bucket.
 *
 * Length-prefixing the artist makes the key injective regardless of
 * which characters the names contain: artist `"a"` + title `"b:c"`
 * can't collide with artist `"a:b"` + title `"c"`, because the
 * artist's length pins its boundary exactly. So distinct
 * (artist, title) pairs always map to distinct keys — no separator
 * char that a real title might contain can cause a false merge.
 */
export function nameAliasKey(artist: string, title: string): string | null {
  const a = normalizeNameForKey(artist);
  const t = normalizeNameForKey(title);
  if (!a || !t) return null;
  return `track-links:name:${a.length}:${a}:${t}`;
}

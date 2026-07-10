/**
 * Tolerant parser for the IFTTT-produced Critical Darlings ingest body.
 *
 * IFTTT's "Make a web request" action does *raw string substitution* of
 * ingredient values into the body template — it does NOT URL-encode
 * them. So a value containing `&` (extremely common in music: "R&B",
 * "Panda Bear & Sonic Boom") makes a standard
 * `application/x-www-form-urlencoded` parse (`request.formData()` /
 * `URLSearchParams`) terminate the field at that `&`, silently
 * truncating the summary / title / artist. That was the cause of the
 * "…ethereal R" / "…Panda Bear" cut-offs Parachord's client reported.
 *
 * This parser splits the raw body ONLY on an `&` that immediately
 * precedes a known field key (`&summary=`, `&reviewUrl=`, …), so a
 * stray `&` inside a value is preserved. Values are decoded
 * defensively: a properly percent-encoded client still round-trips,
 * while IFTTT's raw (unencoded) output — which would make
 * `decodeURIComponent` throw on a literal `%` (e.g. "50% off") — falls
 * back to the raw substring.
 *
 * The known-key list mirrors the ingest route's Zod schema; keep them
 * in sync when adding a field.
 */
export const CRITICAL_DARLINGS_FIELD_KEYS = [
  "title",
  "artist",
  "score",
  "summary",
  "reviewUrl",
  "spotifyUrl",
  "pubDate",
] as const;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // IFTTT sent the value raw (unencoded) and it contains a bare `%`
    // that isn't a valid escape — keep it verbatim rather than 400.
    return value;
  }
}

/**
 * Parse an IFTTT ingest body into a `{ key: value }` map, tolerating
 * unencoded `&` inside values. Unknown keys are ignored.
 */
export function parseIftttForm(raw: string): Record<string, string> {
  const boundary = new RegExp(
    `&(?=(?:${CRITICAL_DARLINGS_FIELD_KEYS.join("|")})=)`,
  );
  const known = new Set<string>(CRITICAL_DARLINGS_FIELD_KEYS);
  const out: Record<string, string> = {};
  for (const part of raw.split(boundary)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    if (!known.has(key)) continue;
    out[key] = safeDecode(part.slice(eq + 1));
  }
  return out;
}

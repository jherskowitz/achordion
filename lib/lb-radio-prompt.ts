import { searchArtists } from "./clients/musicbrainz";

/**
 * LB Radio's prompt syntax requires `artist:(...)` to take an MBID.
 * We let users type a name instead — `artist:(Alex G)` — and resolve
 * it to an MBID via MusicBrainz search before sending the prompt
 * upstream.
 *
 * Resolution is best-effort: if MB doesn't find a match, the chunk
 * is left as-is and LB Radio will emit a "no tracks" / parse error
 * the StationResults component already handles.
 *
 * Returns the rewritten prompt. Safe to call when no `artist:(...)`
 * chunks are present (returns the input unchanged) or when all
 * chunks are already MBIDs (same — no MB calls fire).
 */

const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARTIST_CHUNK_RE = /artist:\(([^)]+)\)/gi;

export async function resolveArtistNamesInPrompt(prompt: string): Promise<string> {
  // Collect unique names that need resolution. Skip empty `()` and
  // anything that's already an MBID.
  const names = new Set<string>();
  for (const m of prompt.matchAll(ARTIST_CHUNK_RE)) {
    const inside = m[1]?.trim();
    if (!inside || MBID_RE.test(inside)) continue;
    names.add(inside);
  }
  if (names.size === 0) return prompt;

  // Resolve in parallel — each searchArtists call is its own
  // mb-rate-limited fetch, so parallelizing buys nothing on cold
  // cache, but warm hits return immediately.
  const resolved = new Map<string, string>();
  await Promise.all(
    [...names].map(async (name) => {
      try {
        const results = await searchArtists(name, 1);
        if (results[0]?.id) resolved.set(name, results[0].id);
      } catch {
        // Silent — fall through to unresolved chunk in the rewrite.
      }
    }),
  );

  // Rewrite each chunk. Pass through MBID-shaped chunks and any
  // names we couldn't resolve, so a partial failure doesn't lose the
  // user's intent — they'll see whichever surface (LB Radio error,
  // page-level "no tracks" message) is most informative.
  return prompt.replace(ARTIST_CHUNK_RE, (full, inside: string) => {
    const trimmed = inside.trim();
    if (!trimmed || MBID_RE.test(trimmed)) return full;
    const mbid = resolved.get(trimmed);
    return mbid ? `artist:(${mbid})` : full;
  });
}

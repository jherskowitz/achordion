import "server-only";

import { searchArtists } from "./clients/musicbrainz";

/**
 * Server-side prompt rewriter. Lets users type
 * `artist:(<artist name>)` instead of `artist:(<MBID>)` — we
 * MB-search the name and substitute the MBID before sending the
 * prompt upstream to LB Radio.
 *
 * Lives in a separate `*-server.ts` file (rather than alongside
 * `prettifyPrompt`) because the `searchArtists` import pulls in
 * `lib/clients/musicbrainz.ts`'s `server-only` declaration. Any
 * client-side import of a transitive server-only chain compiles
 * the chain into the browser bundle and Next refuses. Keeping the
 * resolver siloed here means the pure-helper module
 * (`lb-radio-prompt.ts`) stays client-importable for chips and
 * tooltips that need `prettifyPrompt`.
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

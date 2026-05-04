/**
 * Pure helpers for working with LB Radio prompt strings. No external
 * dependencies — safe to import from server components, client
 * components, route handlers, anywhere.
 *
 * Server-side artist-name → MBID resolution lives in a sibling
 * module (`lb-radio-prompt-server.ts`) because that path imports
 * `lib/clients/musicbrainz.ts`, which is `server-only`. Pulling the
 * resolver in transitively from a client component compiles the
 * server-only chain into the browser bundle and Next blows up.
 *
 * Rule of thumb (mirrors AGENTS.md #8): any helper consumed on both
 * sides of the server/client boundary lives in a module that only
 * imports other client-safe modules. Server-only deps stay in
 * `*-server.ts` siblings.
 */

const ANY_CHUNK_RE = /(\w+):\(([^)]+)\)/gi;

/**
 * Turn an LB Radio prompt into a friendly display string for chips,
 * headers, and tooltips. Examples:
 *
 *   "artist:(Big Thief)"            → "Big Thief"
 *   "tag:(shoegaze)"                → "Shoegaze"
 *   "country:(spain)"               → "Spain"
 *   "tag:(dream pop, ambient)"      → "Dream pop, Ambient"
 *   "country:(spain) tag:(indie)"   → "Spain · Indie"
 *   "artist:(<mbid>)"               → "<mbid>"  (pass-through)
 *
 * For tag and country chunks, comma-separated items are split and
 * each piece is title-cased. Artist chunks pass through verbatim
 * since the user typed the canonical name.
 *
 * Returns the original prompt unchanged when no `kind:(...)` chunks
 * match, so freeform inputs degrade gracefully.
 */
export function prettifyPrompt(prompt: string): string {
  const parts: string[] = [];
  for (const m of prompt.matchAll(ANY_CHUNK_RE)) {
    const kind = m[1]?.toLowerCase();
    const inside = m[2]?.trim();
    if (!inside) continue;
    if (kind === "artist") {
      // Pass the user's typed name through verbatim. If they pasted
      // an MBID, that lands here too — rare enough that prettifying
      // it isn't worth the lookup round-trip.
      parts.push(inside);
    } else {
      const items = inside
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      parts.push(items.join(", "));
    }
  }
  return parts.length > 0 ? parts.join(" · ") : prompt;
}

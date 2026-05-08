/**
 * Pure host-normalisation helpers. Lives outside `lib/track-links-
 * store.ts` (which is `server-only` for Upstash) so client components
 * can import these too — `<StreamingLinksRow>` uses `canonicalHost`
 * to dedupe a server-seeded MB tile against a client-fetched Odesli
 * tile for the same service.
 */

/**
 * Normalize a hostname to a canonical form for dedup. Different
 * variants of the same service (`open.spotify.com` vs `spotify.com`,
 * `m.youtube.com` vs `youtube.com`) should collapse to one identity
 * key — without this, naive set-dedup treats them as distinct hosts
 * and we end up with a duplicate Spotify pill, etc.
 *
 * Stripped prefixes are device / variant markers that don't change
 * the service identity. We deliberately do NOT strip `music.`:
 * `music.youtube.com` is YouTube Music (different service from
 * YouTube), `music.apple.com` is Apple Music (different from
 * iTunes' `itunes.apple.com`).
 */
export function canonicalHost(host: string): string {
  let h = host.toLowerCase().trim();
  // Order matters — `mobile.` first so it strips before plain `m.`
  // would mis-match a non-mobile host that happens to start with m.
  const PREFIXES = ["open.", "www.", "mobile.", "m.", "play.", "listen."];
  for (const prefix of PREFIXES) {
    if (h.startsWith(prefix)) {
      h = h.slice(prefix.length);
      break;
    }
  }
  return h;
}

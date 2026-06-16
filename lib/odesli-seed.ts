import { canonicalHost } from "@/lib/host";

/**
 * Pick the best URL to seed an Odesli lookup with.
 *
 * Odesli takes any one streaming URL and returns the cross-service
 * set, but the *quality* of what it returns depends on the seed: a
 * mainstream host (Spotify / Apple Music) resolves to a full set,
 * while Bandcamp seeds resolve poorly (Odesli indexes Bandcamp
 * weakly). So when enriching a cache entry we already hold links for,
 * prefer a known-good host over whatever happens to be first.
 *
 * Priority:
 *   1. A cached link on a host Odesli resolves well (in the order
 *      below).
 *   2. An explicit `seedUrl` the caller passed (e.g. a scrobble's
 *      played `origin_url`) — real, but less predictable than a
 *      canonical store link.
 *   3. Any cached non-Bandcamp link.
 *   4. Any cached link at all.
 *
 * Returns null only when there's nothing usable.
 *
 * Pure + dependency-light (only `canonicalHost`) so it's unit-testable
 * without standing up the resolver / Redis / Odesli.
 */

// Hosts Odesli resolves well, best seeds first. Bandcamp is
// deliberately absent — it's a poor Odesli seed.
const GOOD_SEED_HOSTS = [
  "spotify.com",
  "music.apple.com",
  "tidal.com",
  "deezer.com",
  "music.youtube.com",
  "youtube.com",
  "soundcloud.com",
  "music.amazon.com",
  "pandora.com",
];

export function pickOdesliSeed(
  links: { url: string; host: string }[],
  seedUrl?: string | null,
): string | null {
  for (const host of GOOD_SEED_HOSTS) {
    const hit = links.find((l) => canonicalHost(l.host) === host);
    if (hit) return hit.url;
  }
  if (seedUrl) return seedUrl;
  const nonBandcamp = links.find(
    (l) => canonicalHost(l.host) !== "bandcamp.com",
  );
  return nonBandcamp?.url ?? links[0]?.url ?? null;
}

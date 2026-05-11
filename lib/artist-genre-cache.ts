import "server-only";

import { Redis } from "@upstash/redis";
import { getArtist } from "@/lib/clients/musicbrainz";

/**
 * Per-MBID artist top-genre cache.
 *
 * Reads MB's `artist.genres` (preferring it over `artist.tags`) and
 * stores the highest-count entry as the "top genre" for that
 * artist. Backed by Upstash with a 90-day TTL — the same shape as
 * the track-links cache. Cache key: `artist-genre:<mbid>`.
 *
 * Read path is one Redis `MGET` over N MBIDs. The MB lookup
 * needed to populate a missing entry happens *off* the hot path
 * (fire-and-forget backfill) so the call site that triggered the
 * miss isn't blocked by the 1-req/sec MB rate limit. The first
 * render of a given artist's fingerprint slot uses the
 * hash-fallback colour; subsequent renders (after the backfill
 * lands) pick up the genre-based colour.
 *
 * Falls through to a no-op when Upstash isn't configured (local
 * dev without REST creds) — the genre map is empty in that mode
 * and callers fall back to whatever default colour they prefer.
 */

export const ARTIST_GENRE_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Sentinel written when MB returns an artist with no usable genre /
 * tag data. Without this, the next backfill request for the same
 * MBID re-issues the MB call and we re-pay the rate-limit cost on
 * every profile-page render for that artist forever. Reads filter
 * the sentinel out so callers see it as "no cached genre" — but
 * subsequent backfill scans see the key as present and skip it.
 */
const UNKNOWN_GENRE_SENTINEL = "__none__";

/**
 * Cap on how many missing MBIDs `backfillArtistGenres` will fetch
 * in one call. The fetch is serialised through MB's 1 req/sec
 * rate limit, so an unbounded backfill of 24 artists per
 * fingerprint compute could sit on the in-process MB queue for
 * 24 seconds — blocking unrelated MB-dependent renders that
 * happen to share the same Node.js invocation. 3 keeps the worst-
 * case backfill below 3 seconds; combined with the 24h
 * `unstable_cache` on the fingerprint, a user's full 24-artist
 * top list fully backfills in 8 days of normal traffic.
 */
const BACKFILL_MAX_PER_CALL = 3;

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function key(mbid: string): string {
  return `artist-genre:${mbid.toLowerCase()}`;
}

/**
 * Batch read of cached top genres. Returns a `Map<mbid, genre>`
 * containing only the MBIDs that had a cached entry — missing
 * MBIDs are absent from the result so callers can decide their
 * own fallback path (typically: kick off a backfill for the
 * missing set, render with hash-colour for this pass).
 */
export async function getArtistTopGenres(
  mbids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!redis || mbids.length === 0) return out;
  try {
    const keys = mbids.map(key);
    const values = await redis.mget<(string | null)[]>(...keys);
    mbids.forEach((mbid, i) => {
      const v = values[i];
      // Sentinel ("__none__") means MB returned no genre data for
      // this artist — leave the map entry absent so the caller
      // colour-falls-back to the artist-identity hash, but DO NOT
      // treat the missing key as "should be backfilled" (the
      // sentinel is exactly what blocks that re-fetch).
      if (typeof v === "string" && v.length > 0 && v !== UNKNOWN_GENRE_SENTINEL) {
        out.set(mbid, v);
      }
    });
  } catch {
    // empty map — caller treats absent entries as fallback path
  }
  return out;
}

/**
 * Surface which MBIDs have ANY cached entry (genre OR sentinel),
 * so callers can pick the "should I trigger a backfill?" subset
 * correctly: backfill only the MBIDs that are absent from this
 * set, not the ones that returned the sentinel.
 *
 * Read shape is the same single MGET as `getArtistTopGenres`;
 * caller often wants both maps and calls them together — Next's
 * dedupe-per-request cache means the second MGET is free.
 */
export async function getArtistGenreCachedSet(
  mbids: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!redis || mbids.length === 0) return out;
  try {
    const keys = mbids.map(key);
    const values = await redis.mget<(string | null)[]>(...keys);
    mbids.forEach((mbid, i) => {
      if (typeof values[i] === "string") out.add(mbid);
    });
  } catch {
    // empty set — caller falls back to full backfill, which is
    // safe even if slow
  }
  return out;
}

/** Pick the highest-count entry from an MB tags/genres array. MB
 *  returns them unsorted, so we explicitly sort by count desc
 *  with a name tiebreak for determinism. */
function pickTopGenreName(
  entries: ReadonlyArray<{ name: string; count: number }> | undefined,
): string | null {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
  // Skip entries with count = 0 (rare but possible — MB returns
  // them when the tag exists but everyone removed their vote).
  const winner = sorted.find((e) => e.count > 0);
  return winner ? winner.name.toLowerCase() : null;
}

/**
 * Fire-and-forget backfill: walk a list of MBIDs whose top genre
 * isn't yet cached, fetch each from MB (one at a time, serialized
 * through the existing 1-req/sec MB rate-limit queue), pick the
 * top genre, write it to Upstash.
 *
 * Errors per-MBID are swallowed silently — a single bad fetch
 * shouldn't block the rest of the batch. Caller is expected to
 * NOT `await` this; it runs in the background while the current
 * render returns with hash-fallback colours.
 */
export async function backfillArtistGenres(mbids: string[]): Promise<void> {
  if (!redis || mbids.length === 0) return;
  // Cap the per-call batch so a single fingerprint compute can't
  // monopolise the 1 req/sec MB rate-limit queue. The remaining
  // MBIDs will be picked up on subsequent renders.
  const slice = mbids.slice(0, BACKFILL_MAX_PER_CALL);
  for (const mbid of slice) {
    try {
      const artist = await getArtist(mbid);
      // Prefer `.genres` (MB's curated genre tags) over `.tags`
      // (free-form user tags). Falls back to the sentinel when
      // MB has no genre data on this artist — without the
      // sentinel, every subsequent render of any user who has
      // this artist in their top-N would re-pay the MB call.
      const genre =
        pickTopGenreName(artist.genres) ?? pickTopGenreName(artist.tags);
      await redis.set(key(mbid), genre ?? UNKNOWN_GENRE_SENTINEL, {
        ex: ARTIST_GENRE_TTL_SECONDS,
      });
    } catch {
      // continue — single-artist failures shouldn't stop the batch
    }
  }
}

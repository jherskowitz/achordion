import "server-only";

import { unstable_cache } from "next/cache";
import { getUserTopArtists } from "@/lib/clients/listenbrainz";
import {
  backfillArtistGenres,
  getArtistTopGenres,
} from "@/lib/artist-genre-cache";

/**
 * Listener-fingerprint data layer.
 *
 * Produces 24 radial segments derived from a user's top-24 all-time
 * artists. The visualization is a "burst" / radial-bar SVG where:
 *
 *   - segment angle is constant (360° / 24 = 15° each)
 *   - segment radius (bar height) is relative listen count, square-
 *     rooted to compress the long-tail squash that otherwise leaves
 *     bars 2-24 looking equally short next to a giant bar 1
 *   - segment colour is a deterministic hash of the artist's
 *     identity into Achordion's Parachord-aligned 9-colour palette
 *     (see `--palette-*` in globals.css), so the same artist
 *     colours the same wedge in everyone's fingerprint AND the
 *     glyph reads as on-brand against the rest of the app
 *
 * Combined, the bar-height profile + colour distribution make the
 * glyph recognisable per user at thumbnail size and full size.
 *
 * Stateless: one LB call (`getUserTopArtists`) wrapped in 24h
 * `unstable_cache` per username. No new MB lookups, no Achordion-
 * side storage. Cache slot is shared with whatever other surface
 * pulled the same `top-artists?range=all_time` data first.
 */

/**
 * Parachord-aligned palette mirror of `--palette-*` in globals.css.
 * Pinned here as raw hex so the SVG can render server-side without
 * a getComputedStyle round-trip; if the CSS palette ever changes,
 * update this list in lockstep.
 *
 * Order is the same nine-colour set used by Parachord's sidebar /
 * DiceBear avatar backgrounds — keeps the fingerprint visually
 * cohesive with the rest of the Achordion UI.
 */
const PARACHORD_PALETTE = [
  "#7c3aed", // violet (= parachord accent)
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#10c9b4", // teal
] as const;

export interface FingerprintSegment {
  /** 0-1 normalised bar height. Largest bar = 1. */
  height: number;
  /** Hex colour picked from the Parachord palette via artist hash. */
  color: string;
  /** Artist name (for the SVG `<title>` accessibility text and the
   *  interactive hover label). */
  artistName: string;
  /** Artist MBID — used to deep-link the wedge to /artist/<mbid>
   *  when the user clicks it in the interactive renderer. Null
   *  when LB returns an artist without an MBID (rare; falls back
   *  to a name-based lookup link). */
  artistMbid: string | null;
  /** Raw listen count — surfaces in the tooltip on hover. */
  listenCount: number;
}

export interface ListenerFingerprint {
  segments: FingerprintSegment[];
  /** Top 5 artist names + play counts — surfaced in the chip's
   *  hover tooltip so users see the per-artist breakdown without
   *  pointing at individual wedges (native SVG `<title>` is too
   *  slow to discover and gets stepped on by the faster IconTooltip
   *  bubble). 5 is enough to read as personality, few enough that
   *  the tooltip fits within the `max-w-[20rem]` IconTooltip cap. */
  topArtists: Array<{ name: string; listenCount: number }>;
}

/** Cap on the number of segments. 24 ≈ one segment per 15° — fine
 *  granularity at full size (~200px) without segments becoming
 *  unreadable noise at thumbnail size (~48px). */
const SEGMENT_COUNT = 24;

/** Deterministic 32-bit hash of a string, FNV-1a. We only need a
 *  modest spread of integers in [0, 360); cryptographic strength is
 *  overkill, and FNV-1a is small + fast + has no dependencies. */
function hashStringFnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 16777619 = FNV prime. >>> 0 keeps the result a 32-bit unsigned int.
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/** Pick a palette colour from a seed string via FNV-1a hash. */
function paletteColorFromSeed(seed: string): string {
  return PARACHORD_PALETTE[
    hashStringFnv1a(seed) % PARACHORD_PALETTE.length
  ];
}

/** Wedge colour resolution. Prefers the artist's top genre when
 *  the genre cache has an entry — same genre across all profiles
 *  hashes to the same colour, which creates a shared visual
 *  vocabulary (two listeners with overlapping indie-rock libraries
 *  see overlapping colour clusters in their fingerprints). Falls
 *  back to the artist's MBID / name when no genre is cached so
 *  the glyph stays distinct on cold-cache renders.
 */
function paletteColorFromArtistIdentity(
  mbid: string | null | undefined,
  name: string,
  cachedGenre: string | undefined,
): string {
  if (cachedGenre) return paletteColorFromSeed(cachedGenre);
  const seed = mbid?.trim() || name.trim().toLowerCase();
  return paletteColorFromSeed(seed);
}

async function computeFingerprint(
  name: string,
): Promise<ListenerFingerprint | null> {
  // All-time top is the most stable surface; week / month rotate
  // too quickly to give the glyph a recognisable identity. (We can
  // expose a per-window variant later if there's demand for "this
  // year's fingerprint" / "this month's fingerprint" prints.)
  const artists = await getUserTopArtists(name, "all_time", SEGMENT_COUNT).catch(
    () => [],
  );
  if (artists.length < 6) return null;

  const counts = artists.map((a) => a.listen_count);
  const maxCount = Math.max(...counts);
  if (maxCount === 0) return null;

  // Pull the cached top genre per artist (one Upstash MGET) for
  // genre-coloured wedges. The MB lookup that populates a missing
  // entry happens fire-and-forget below — this render uses
  // whatever's already in cache, future renders pick up newly-
  // backfilled entries.
  const mbids = artists
    .map((a) => a.artist_mbid)
    .filter((m): m is string => !!m);
  const genres = await getArtistTopGenres(mbids);

  // sqrt-compression keeps the long-tail visible. Without it, a user
  // whose top artist is 10× their #5 ends up with bars #5-24 reading
  // as identical stumps — pure top-artist information, no shape.
  const segments: FingerprintSegment[] = artists.map((a) => {
    const normalised = Math.sqrt(a.listen_count / maxCount);
    const cachedGenre =
      a.artist_mbid ? genres.get(a.artist_mbid) : undefined;
    return {
      height: normalised,
      color: paletteColorFromArtistIdentity(
        a.artist_mbid,
        a.artist_name,
        cachedGenre,
      ),
      artistName: a.artist_name,
      artistMbid: a.artist_mbid ?? null,
      listenCount: a.listen_count,
    };
  });

  // Backfill: kick off MB lookups for the artists whose genre we
  // don't have cached yet. Don't await — this render returns with
  // hash-fallback colours for the missing artists, and the
  // subsequent render (after 24h `unstable_cache` revalidate)
  // picks up the newly-cached genres. The backfill itself is
  // serialised through the existing MB rate-limit queue so it
  // doesn't burst against MusicBrainz.
  const missingMbids = mbids.filter((m) => !genres.has(m));
  if (missingMbids.length > 0) {
    void backfillArtistGenres(missingMbids);
  }

  // Pad up to SEGMENT_COUNT with empty wedges so the glyph's
  // geometry is consistent across users (smaller libraries get
  // shorter bars, not fewer of them). Empty wedges render in muted
  // grey via the component (color field unused for height=0).
  while (segments.length < SEGMENT_COUNT) {
    segments.push({
      height: 0,
      color: "",
      artistName: "",
      artistMbid: null,
      listenCount: 0,
    });
  }

  return {
    segments,
    topArtists: artists.slice(0, 5).map((a) => ({
      name: a.artist_name,
      listenCount: a.listen_count,
    })),
  };
}

export async function getListenerFingerprint(
  name: string,
): Promise<ListenerFingerprint | null> {
  if (!name) return null;
  // `v5` suffix bumps the cache slot — wedge colour now resolves
  // from each artist's top genre (when cached in
  // `artist-genre:*`) before falling back to the artist-identity
  // hash. Stale v4 entries would otherwise lock in the pre-genre
  // hash colours for 24h after the change. Prior bumps:
  //   v1 → v2  hue → palette colour
  //   v2 → v3  topArtistNames → topArtists w/ counts
  //   v3 → v4  segment.artistMbid added for click-through
  //   v4 → v5  colour seeds prefer top genre over artist identity
  const cached = unstable_cache(
    () => computeFingerprint(name),
    ["listener-fingerprint-v5", name.toLowerCase()],
    {
      revalidate: 86400,
      tags: [`listener-fingerprint:${name.toLowerCase()}`],
    },
  );
  return cached();
}

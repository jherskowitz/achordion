import {
  searchArtists,
  searchReleaseGroups,
  searchRecordings,
} from "@/lib/clients/musicbrainz";
import {
  getArtistPopularityBatch,
  getRecordingMetadata,
  getRecordingPopularityBatch,
  getReleaseGroupPopularityBatch,
  searchUsers,
} from "@/lib/clients/listenbrainz";

/**
 * Power-search prefixes accepted by the search box. `track:` and
 * `recording:` are aliases for `song:` so users can type whichever
 * vocabulary feels natural.
 */
const KIND_PREFIXES: Record<string, "artist" | "album" | "song" | "user"> = {
  artist: "artist",
  album: "album",
  song: "song",
  track: "song",
  recording: "song",
  user: "user",
};

interface ParsedQuery {
  kind: "artist" | "album" | "song" | "user" | null;
  q: string;
}

/**
 * `artist:hozier` / `album:moondance` / `song:wonderful tonight` /
 * `user:rob` — leading prefix restricts the search to that kind.
 * No prefix → query everything in parallel.
 *
 * Trims whitespace; preserves the rest of the query as a freeform
 * MB lucene-style string (the underlying clients pass it through to
 * MB's `query=` param verbatim, so quoted phrases and operators
 * still work).
 */
// NOT exported: route.ts files may only export route handlers
// (GET/POST/…) and known route config. Exporting an arbitrary
// helper makes the file fail Next's route-type check under the
// webpack builder (Turbopack's build was silently permitting it).
// This helper is only used within this file anyway.
function parseSearchQuery(raw: string): ParsedQuery {
  const m = raw.match(/^([a-z]+):\s*(.+)$/i);
  if (m) {
    const kind = KIND_PREFIXES[m[1].toLowerCase()];
    if (kind) return { kind, q: m[2].trim() };
  }
  return { kind: null, q: raw.trim() };
}

const LIMIT = 8;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("q") ?? "";
  const { kind, q } = parseSearchQuery(raw);

  if (!q) {
    return Response.json({ artists: [], albums: [], songs: [], users: [] });
  }

  // Run all four lookups in parallel, but only the ones the kind
  // filter allows. Each branch catches its own errors so a single
  // failing client doesn't blank the whole page.
  const [artists, albums, songs, users] = await Promise.all([
    !kind || kind === "artist"
      ? searchArtists(q, LIMIT).catch(() => [])
      : Promise.resolve([]),
    !kind || kind === "album"
      ? searchReleaseGroups(q, LIMIT).catch(() => [])
      : Promise.resolve([]),
    !kind || kind === "song"
      ? searchRecordings(q, LIMIT).catch(() => [])
      : Promise.resolve([]),
    !kind || kind === "user"
      ? searchUsers(q, LIMIT).catch(() => [])
      : Promise.resolve([]),
  ]);

  // In parallel: popularity (used to sort each kind by listen count
  // desc) AND song-cover enrichment via LB's recording-metadata batch
  // endpoint. The metadata endpoint returns release info per-recording
  // including caa_release_mbid + caa_id, which we turn into a CAA
  // thumbnail URL on the client side.
  const [artistPop, albumPop, songPop, songMeta] = await Promise.all([
    getArtistPopularityBatch(artists.map((a) => a.id)),
    getReleaseGroupPopularityBatch(albums.map((a) => a.id)),
    getRecordingPopularityBatch(songs.map((s) => s.id)),
    getRecordingMetadata(songs.map((s) => s.id)),
  ]);
  artists.sort(
    (a, b) => (artistPop.get(b.id) ?? 0) - (artistPop.get(a.id) ?? 0),
  );
  albums.sort(
    (a, b) => (albumPop.get(b.id) ?? 0) - (albumPop.get(a.id) ?? 0),
  );
  songs.sort(
    (a, b) => (songPop.get(b.id) ?? 0) - (songPop.get(a.id) ?? 0),
  );

  // Shape artist-credit into the structured form `<ArtistCreditLinks>`
  // expects on the client — preserving each contributor's MBID and the
  // join phrase between them. That lets the typeahead link every
  // collaborator individually instead of just the primary credit.
  return Response.json({
    artists: artists.map((a) => ({
      id: a.id,
      name: a.name,
      disambiguation: a.disambiguation ?? null,
      type: a.type ?? null,
      country: a.country ?? null,
    })),
    albums: albums.map((rg) => ({
      id: rg.id,
      title: rg.title,
      artists:
        rg["artist-credit"]?.map((c) => ({
          name: c.name,
          mbid: c.artist?.id ?? null,
          join: c.joinphrase ?? "",
        })) ?? [],
      type: rg["primary-type"] ?? null,
      year: rg["first-release-date"]?.slice(0, 4) ?? null,
    })),
    songs: songs.map((r) => {
      const meta = songMeta.get(r.id);
      const release = meta?.release;
      return {
        id: r.id,
        title: r.title,
        artists:
          r["artist-credit"]?.map((c) => ({
            name: c.name,
            mbid: c.artist?.id ?? null,
            join: c.joinphrase ?? "",
          })) ?? [],
        length: r.length ?? null,
        // Pass the cover-art identifiers through to the client so it
        // can build a CAA URL. Prefer the specific release's CAA id
        // (high-fidelity match), fall back to the release-group MBID
        // (may differ in cover art across editions but better than
        // nothing).
        caaReleaseMbid: release?.caa_release_mbid ?? null,
        caaId: release?.caa_id ?? null,
        releaseGroupMbid: release?.release_group_mbid ?? null,
      };
    }),
    users: users.map((name) => ({ name })),
  });
}

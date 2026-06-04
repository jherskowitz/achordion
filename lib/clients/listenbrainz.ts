import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

import { z } from "zod";

const LB_BASE = "https://api.listenbrainz.org/1";
const LB_LABS_BASE = "https://labs.api.listenbrainz.org";
const USER_AGENT =
  "Achordion/0.1 (+https://github.com/jherskowitz/achordion)";

// Hard ceiling on a single LB HTTP round-trip. LB usually answers in
// <2s but can leave a connection open indefinitely on some endpoints
// (observed: a release-group listener-stats request that never
// returned, which wedged the /release-group render's Suspense
// boundary and hung the whole page stream — curl saw a 30s+ partial
// response; the browser sat on its skeleton). Without an abort, a hung
// LB call blocks the React stream forever. AbortSignal.timeout turns
// the hang into a thrown error the callers' `.catch` already handles,
// so the affected section degrades to empty instead of hanging the
// page. Mirrors mbFetch's MB_FETCH_TIMEOUT_MS.
const LB_FETCH_TIMEOUT_MS = 10000;

export class ListenBrainzError extends Error {
  // Next.js preserves `digest` across the server→client error boundary
  // even in production (where the message is sanitized), so we tag
  // 429 / 503 responses with a known string and let
  // `app/(app)/error.tsx` show a rate-limit-specific page instead of
  // the generic fallback. Mirrors the MusicBrainzError pattern.
  digest?: string;
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    if (status === 429 || status === 503) {
      this.digest = "LB_RATE_LIMITED";
    }
  }
}

export const cacheTagsLB = {
  userListens: (name: string) => `lb:user:${name}:listens`,
  userStats: (name: string) => `lb:user:${name}:stats`,
  user: (name: string) => `lb:user:${name}`,
  recording: (mbid: string) => `lb:recording:${mbid}`,
};

interface FetchOptions {
  /** Seconds — default 60. Pass 0 to disable caching. */
  revalidate?: number;
  tags?: string[];
  /**
   * Bypass the Next data cache entirely. Used by live polling routes
   * (recent-listens, playing-now) where stale-from-cache defeats the
   * point of polling.
   */
  noStore?: boolean;
  /**
   * LB user token for endpoints whose response varies per-viewer
   * (e.g. private playlists visible only to the owner). When set,
   * `lbFetch` switches to `no-store` automatically — the response
   * is personal so we can't share it across viewers via the data
   * cache.
   */
  token?: string;
}

async function lbFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  opts: FetchOptions = {},
): Promise<T> {
  const url = `${LB_BASE}${path}`;
  // When a token is provided the response is personalized — caching
  // it under a viewer-agnostic URL key would cross the streams.
  const noStore = opts.noStore || opts.token !== undefined;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (opts.token) headers.Authorization = `Token ${opts.token}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers,
      signal: AbortSignal.timeout(LB_FETCH_TIMEOUT_MS),
      cache: noStore ? "no-store" : undefined,
      next: noStore
        ? undefined
        : {
            revalidate: opts.revalidate ?? 60,
            tags: opts.tags,
          },
    });
  } catch (e) {
    // AbortSignal.timeout fires a TimeoutError DOMException; network
    // failures throw TypeError. Normalize both into a ListenBrainzError
    // so a hung/failed LB call surfaces as a thrown error the caller's
    // `.catch` handles — never an indefinitely pending fetch that
    // wedges the React stream.
    const aborted = e instanceof DOMException && e.name === "TimeoutError";
    throw new ListenBrainzError(
      aborted ? 504 : 503,
      aborted
        ? `LB timeout after ${LB_FETCH_TIMEOUT_MS}ms: ${path}`
        : `LB fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ListenBrainzError(res.status, `LB ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return schema.parse(json);
}

const ListenSchema = z.object({
  listened_at: z.number(),
  user_name: z.string().optional(),
  track_metadata: z.object({
    track_name: z.string(),
    artist_name: z.string(),
    release_name: z.string().nullish(),
    additional_info: z
      .object({
        recording_mbid: z.string().optional(),
        release_mbid: z.string().optional(),
        release_group_mbid: z.string().optional(),
        artist_mbids: z.array(z.string()).optional(),
        duration_ms: z.number().optional(),
        spotify_id: z.string().optional(),
        // Streamed-from source, enriched by Parachord ≥ v0.9.4.
        // `origin_url` is the URL actually played; `music_service` is
        // its canonical host (e.g. "spotify.com"); `music_service_name`
        // is the human label (e.g. "Spotify"). See `deriveListenSource`.
        origin_url: z.string().optional(),
        music_service: z.string().optional(),
        music_service_name: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    mbid_mapping: z
      .object({
        recording_mbid: z.string().optional(),
        release_mbid: z.string().optional(),
        artist_mbids: z.array(z.string()).optional(),
        caa_id: z.union([z.number(), z.string()]).optional(),
        caa_release_mbid: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  }),
});

export type Listen = z.infer<typeof ListenSchema>;

const ListensResponseSchema = z.object({
  payload: z.object({
    count: z.number(),
    user_id: z.string().optional(),
    latest_listen_ts: z.number().optional(),
    oldest_listen_ts: z.number().optional(),
    listens: z.array(ListenSchema),
  }),
});

export async function getRecentListens(
  userName: string,
  opts: {
    count?: number;
    minTs?: number;
    maxTs?: number;
    /** Skip the Next data cache — for client-polled live views. */
    live?: boolean;
  } = {},
): Promise<Listen[]> {
  const params = new URLSearchParams();
  if (opts.count) params.set("count", String(opts.count));
  if (opts.minTs) params.set("min_ts", String(opts.minTs));
  if (opts.maxTs) params.set("max_ts", String(opts.maxTs));
  const qs = params.toString();
  const path = `/user/${encodeURIComponent(userName)}/listens${qs ? `?${qs}` : ""}`;

  const result = await lbFetch(
    path,
    ListensResponseSchema,
    opts.live
      ? { noStore: true }
      : {
          revalidate: 60,
          tags: [cacheTagsLB.userListens(userName), cacheTagsLB.user(userName)],
        },
  );
  return result.payload.listens.map(cleanListenInPlace);
}

/**
 * Most-recent activity per LB scrobble integration, used by
 * /settings/connections to surface "Last Spotify scrobble: 2h ago"
 * pills next to the Manage links.
 *
 * **This is a heuristic, not a true connection-state read.** LB has
 * no public API for "is the user's Spotify importer enabled right
 * now"; we infer activity from the `submission_client` field LB
 * stamps on each listen. A connected service that hasn't scrobbled
 * inside the recent window will read as null here. False positives
 * are possible too — old Last.fm-imported history persists even
 * after the user disconnects. The right read is "we've recently
 * seen this submission source," not "the connection is live."
 */
export interface MusicServiceActivity {
  /** Latest listened_at (unix seconds) for each known submitter. null = none seen. */
  spotify: number | null;
  lastfm: number | null;
  librefm: number | null;
}

const SUBMISSION_CLIENT_MATCHERS: Array<{
  service: keyof MusicServiceActivity;
  re: RegExp;
}> = [
  { service: "spotify", re: /spotify/i },
  // LB's Last.fm importer historically ships under several names —
  // "ListenBrainz lastfm importer v2" is current, older listens may
  // show "lastfmscraper" / "Last.fm Importer" / similar.
  { service: "lastfm", re: /(last\.?fm)/i },
  { service: "librefm", re: /(libre\.?fm)/i },
];

/**
 * Walks the user's most recent listens and groups them by which LB
 * integration submitted each one, returning the latest timestamp per
 * service. Used for the connections-page status pills.
 */
export async function getMusicServiceActivity(
  userName: string,
): Promise<MusicServiceActivity> {
  const activity: MusicServiceActivity = {
    spotify: null,
    lastfm: null,
    librefm: null,
  };
  let listens: Listen[];
  try {
    listens = await getRecentListens(userName, { count: 100 });
  } catch {
    return activity;
  }
  for (const l of listens) {
    const client = l.track_metadata.additional_info?.submission_client;
    if (typeof client !== "string") continue;
    for (const { service, re } of SUBMISSION_CLIENT_MATCHERS) {
      if (!re.test(client)) continue;
      const ts = l.listened_at;
      if (typeof ts !== "number") continue;
      const prev = activity[service];
      if (prev === null || ts > prev) {
        activity[service] = ts;
      }
      break;
    }
  }
  return activity;
}

/**
 * Some scrobble clients write JS-string-literal-escaped values into
 * track / artist / release fields ("Where We Fall We\\'ll Lie" with a
 * literal backslash + apostrophe). LB stores the bytes verbatim and
 * the API returns them unchanged, so they reach our UI as `We\'ll`.
 *
 * Strip the two escapes that are unambiguously wrong in a display
 * string: `\\'` → `'` and `\\"` → `"`. We deliberately don't touch
 * `\\\\` → `\\` because a literal backslash in a title is conceivable
 * (file-name-derived titles, weird mixtape track names) and we
 * haven't seen evidence of that leaking yet.
 */
function cleanLbText(s: string): string;
function cleanLbText(s: string | null | undefined): string | null | undefined;
function cleanLbText(s: string | null | undefined) {
  if (typeof s !== "string") return s;
  return s.replace(/\\(['"])/g, "$1");
}

function cleanListenInPlace<T extends Listen | PlayingNowListen>(l: T): T {
  const m = l.track_metadata;
  m.track_name = cleanLbText(m.track_name);
  m.artist_name = cleanLbText(m.artist_name);
  if (m.release_name) m.release_name = cleanLbText(m.release_name);
  return l;
}

// LB's /playing-now response omits `listened_at` for the currently-
// playing item (it isn't a finalised scrobble yet) and adds a
// `playing_now: true` flag. Reuse ListenSchema's track_metadata but
// make listened_at optional and accept the extra flag.
const PlayingNowListenSchema = ListenSchema.extend({
  listened_at: z.number().optional(),
  playing_now: z.boolean().optional(),
});

export type PlayingNowListen = z.infer<typeof PlayingNowListenSchema>;

const PlayingNowResponseSchema = z.object({
  payload: z.object({
    count: z.number(),
    user_id: z.string().optional(),
    listens: z.array(PlayingNowListenSchema),
    playing_now: z.boolean().optional(),
  }),
});

export async function getPlayingNow(
  userName: string,
  opts: { live?: boolean } = {},
): Promise<PlayingNowListen | null> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(userName)}/playing-now`,
      PlayingNowResponseSchema,
      opts.live
        ? { noStore: true }
        : { revalidate: 30, tags: [cacheTagsLB.user(userName)] },
    );
    const listen = result.payload.listens[0];
    return listen ? cleanListenInPlace(listen) : null;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 404) return null;
    throw err;
  }
}

const SearchUsersResponseSchema = z.object({
  users: z.array(
    z.object({
      user_name: z.string(),
    }),
  ),
});

export async function searchUsers(query: string, limit = 10): Promise<string[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({
    search_term: query,
    limit: String(limit),
  });
  const result = await lbFetch(
    `/search/users?${params}`,
    SearchUsersResponseSchema,
    { revalidate: 300 },
  );
  return result.users.map((u) => u.user_name);
}

const SitewideStatsArtistsSchema = z.object({
  payload: z.object({
    artists: z.array(
      z.object({
        artist_name: z.string(),
        artist_mbid: z.string().nullish(),
        listen_count: z.number(),
      }),
    ),
    range: z.string(),
    from_ts: z.number().optional(),
    to_ts: z.number().optional(),
  }),
});

export async function getSitewideTopArtists(range = "week", count = 10) {
  const params = new URLSearchParams({ range, count: String(count) });
  const result = await lbFetch(
    `/stats/sitewide/artists?${params}`,
    SitewideStatsArtistsSchema,
    { revalidate: 60 * 60 },
  );
  return result.payload.artists;
}

const SitewideStatsReleaseGroupsSchema = z.object({
  payload: z.object({
    release_groups: z.array(
      z.object({
        release_group_name: z.string(),
        release_group_mbid: z.string().nullish(),
        artist_name: z.string(),
        artist_mbids: z.array(z.string()).optional(),
        listen_count: z.number(),
        caa_id: z.union([z.number(), z.string()]).nullish(),
        caa_release_mbid: z.string().nullish(),
      }),
    ),
    range: z.string(),
    from_ts: z.number().optional(),
    to_ts: z.number().optional(),
  }),
});

export interface SitewideTopReleaseGroup {
  release_group_name: string;
  release_group_mbid: string | null;
  artist_name: string;
  artist_mbids: string[];
  listen_count: number;
  caa_id: number | string | null;
  caa_release_mbid: string | null;
}

const SitewideStatsRecordingsSchema = z.object({
  payload: z.object({
    recordings: z.array(
      z.object({
        track_name: z.string(),
        recording_mbid: z.string().nullish(),
        artist_name: z.string(),
        artist_mbids: z.array(z.string()).optional(),
        release_name: z.string().nullish(),
        release_mbid: z.string().nullish(),
        listen_count: z.number(),
      }),
    ),
    range: z.string(),
    from_ts: z.number().optional(),
    to_ts: z.number().optional(),
  }),
});

export interface SitewideTopRecording {
  track_name: string;
  recording_mbid: string | null;
  artist_name: string;
  artist_mbids: string[];
  release_name: string | null;
  release_mbid: string | null;
  listen_count: number;
}

/**
 * Sitewide top tracks (recordings) by listen count. Same shape as the
 * release-groups endpoint, but per-track. LB doesn't include cover-
 * art identifiers here (unlike release-groups), so callers need to
 * resolve covers separately — `LazyTrackCover` is the right tool.
 */
export async function getSitewideTopRecordings(
  range = "week",
  count = 50,
): Promise<SitewideTopRecording[]> {
  try {
    const params = new URLSearchParams({ range, count: String(count) });
    const result = await lbFetch(
      `/stats/sitewide/recordings?${params}`,
      SitewideStatsRecordingsSchema,
      { revalidate: 60 * 60, tags: [`lb:sitewide:recordings:${range}`] },
    );
    return result.payload.recordings.map((r) => ({
      track_name: r.track_name,
      recording_mbid: r.recording_mbid ?? null,
      artist_name: r.artist_name,
      artist_mbids: r.artist_mbids ?? [],
      release_name: r.release_name ?? null,
      release_mbid: r.release_mbid ?? null,
      listen_count: r.listen_count,
    }));
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

/**
 * Sitewide top albums (release-groups) by listen count over the given
 * range. Public, unauthed; LB returns CAA cover-art identifiers
 * inline so we render straight off the response without a follow-up
 * lookup.
 */
export async function getSitewideTopReleaseGroups(
  range = "week",
  count = 50,
): Promise<SitewideTopReleaseGroup[]> {
  try {
    const params = new URLSearchParams({ range, count: String(count) });
    const result = await lbFetch(
      `/stats/sitewide/release-groups?${params}`,
      SitewideStatsReleaseGroupsSchema,
      { revalidate: 60 * 60, tags: [`lb:sitewide:rgs:${range}`] },
    );
    return result.payload.release_groups.map((r) => ({
      release_group_name: r.release_group_name,
      release_group_mbid: r.release_group_mbid ?? null,
      artist_name: r.artist_name,
      artist_mbids: r.artist_mbids ?? [],
      listen_count: r.listen_count,
      caa_id: r.caa_id ?? null,
      caa_release_mbid: r.caa_release_mbid ?? null,
    }));
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

const TopRecordingForArtistSchema = z.object({
  recording_mbid: z.string(),
  recording_name: z.string(),
  artist_name: z.string(),
  artist_mbids: z.array(z.string()).optional(),
  release_name: z.string().nullish(),
  release_mbid: z.string().nullish(),
  caa_id: z.union([z.number(), z.string()]).nullish(),
  caa_release_mbid: z.string().nullish(),
  total_listen_count: z.number().optional(),
  total_user_count: z.number().optional(),
});

export type TopRecording = z.infer<typeof TopRecordingForArtistSchema>;

export async function getTopRecordingsForArtist(
  artistMbid: string,
): Promise<TopRecording[]> {
  try {
    const result = await lbFetch(
      `/popularity/top-recordings-for-artist/${encodeURIComponent(artistMbid)}`,
      z.array(TopRecordingForArtistSchema),
      { revalidate: 60 * 60 * 6 },
    );
    return result;
  } catch {
    return [];
  }
}

// ─── Playlists ──────────────────────────────────────────────────────

const PlaylistExtensionSchema = z
  .object({
    creator: z.string().optional(),
    last_modified_at: z.string().optional(),
    public: z.boolean().optional(),
    collaborators: z.array(z.string()).optional(),
    copied_from_deleted: z.boolean().optional(),
    additional_metadata: z
      .object({
        algorithm_metadata: z
          .object({ source_patch: z.string().optional() })
          .partial()
          .passthrough()
          .optional(),
        expires_at: z.string().optional(),
        external_urls: z.record(z.string(), z.string()).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .partial()
  .passthrough();

const PlaylistSummarySchema = z.object({
  playlist: z
    .object({
      title: z.string(),
      creator: z.string().optional(),
      annotation: z.string().nullish(),
      date: z.string().optional(),
      identifier: z.string(),
      extension: z
        .object({
          "https://musicbrainz.org/doc/jspf#playlist":
            PlaylistExtensionSchema.optional(),
        })
        .partial()
        .passthrough()
        .optional(),
      track: z.array(z.unknown()).optional(),
    })
    .passthrough(),
});

export type LbPlaylistSummary = z.infer<typeof PlaylistSummarySchema>;

const UserPlaylistsResponseSchema = z.object({
  count: z.number(),
  offset: z.number().optional(),
  playlist_count: z.number().optional(),
  playlists: z.array(PlaylistSummarySchema),
});

export interface UserPlaylistsPage {
  playlists: LbPlaylistSummary[];
  total: number;
  offset: number;
  count: number;
}

export async function getUserPlaylists(
  name: string,
  count = 25,
  offset = 0,
  /** Pass the viewer's LB token to include the user's *private*
   *  playlists in the response — only honored when LB's auth resolves
   *  the token to the same user being queried. Without a token the
   *  endpoint returns public playlists only. */
  token?: string,
): Promise<UserPlaylistsPage> {
  try {
    const params = new URLSearchParams({
      count: String(count),
      offset: String(offset),
    });
    const result = await lbFetch(
      `/user/${encodeURIComponent(name)}/playlists?${params}`,
      UserPlaylistsResponseSchema,
      token
        ? { token }
        : { revalidate: 60 * 5, tags: [`lb:user:${name}:playlists`] },
    );
    return {
      playlists: result.playlists,
      total: result.playlist_count ?? result.playlists.length,
      offset: result.offset ?? offset,
      count: result.count,
    };
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return { playlists: [], total: 0, offset: 0, count };
    }
    throw err;
  }
}

/**
 * Algorithmically-generated playlists that LB created *for* this user
 * (Weekly Jams, Weekly Explorations, Top Discoveries of YYYY, etc.).
 * Same JSPF envelope as getUserPlaylists.
 */
export async function getCreatedForPlaylists(
  name: string,
  count = 25,
  offset = 0,
): Promise<UserPlaylistsPage> {
  try {
    const params = new URLSearchParams({
      count: String(count),
      offset: String(offset),
    });
    const result = await lbFetch(
      `/user/${encodeURIComponent(name)}/playlists/createdfor?${params}`,
      UserPlaylistsResponseSchema,
      {
        revalidate: 60 * 5,
        tags: [`lb:user:${name}:createdfor`],
      },
    );
    return {
      playlists: result.playlists,
      total: result.playlist_count ?? result.playlists.length,
      offset: result.offset ?? offset,
      count: result.count,
    };
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return { playlists: [], total: 0, offset: 0, count };
    }
    throw err;
  }
}

/** Extract the MBID from a LB playlist identifier URL. */
export function playlistMbidFromIdentifier(
  identifier: string | undefined | null,
): string | null {
  if (!identifier) return null;
  const m = identifier.match(/\/playlist\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

export interface PlaylistSummary {
  mbid: string;
  title: string;
  isPublic: boolean;
  lastModifiedAt: string;
}

/**
 * Owner-scoped playlist list for the *viewer* — passes their LB token so
 * private playlists show up too. Flatter than `getUserPlaylists`: just the
 * fields the track-actions "Add to playlist" submenu needs.
 *
 * The viewer-scoped response is personalised, so `lbFetch` skips the data
 * cache (token forces no-store). We still attach a tag for downstream
 * `revalidateTag` after writes — useful when Next caches the calling RSC.
 */
export async function getUserPlaylistsForViewer(
  viewer: string,
  token: string,
  count = 10,
): Promise<PlaylistSummary[]> {
  try {
    const params = new URLSearchParams({ count: String(count) });
    const result = await lbFetch(
      `/user/${encodeURIComponent(viewer)}/playlists?${params}`,
      UserPlaylistsResponseSchema,
      { token, revalidate: 300, tags: [`lb:user:${viewer}:playlists`] },
    );
    const out: PlaylistSummary[] = [];
    for (const entry of result.playlists) {
      const p = entry.playlist;
      const mbid = playlistMbidFromIdentifier(p.identifier);
      if (!mbid) continue;
      const ext = p.extension?.["https://musicbrainz.org/doc/jspf#playlist"];
      out.push({
        mbid,
        title: p.title,
        isPublic: ext?.public ?? true,
        lastModifiedAt: ext?.last_modified_at ?? p.date ?? "",
      });
    }
    return out;
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

// ─── Pinned recordings ─────────────────────────────────────────────

const PinnedTrackMetaSchema = z
  .object({
    track_name: z.string(),
    artist_name: z.string(),
    release_name: z.string().nullish(),
    additional_info: z
      .object({
        recording_mbid: z.string().optional(),
        recording_msid: z.string().optional(),
        release_mbid: z.string().optional(),
        artist_mbids: z.array(z.string()).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    mbid_mapping: z
      .object({
        recording_mbid: z.string().optional(),
        release_mbid: z.string().optional(),
        artist_mbids: z.array(z.string()).optional(),
        caa_id: z.union([z.number(), z.string()]).optional(),
        caa_release_mbid: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

const PinnedRecordingSchema = z.object({
  blurb_content: z.string().nullish(),
  created: z.number(),
  pinned_until: z.number(),
  recording_mbid: z.string().nullish(),
  recording_msid: z.string().nullish(),
  row_id: z.number(),
  track_metadata: PinnedTrackMetaSchema,
});

export type PinnedRecording = z.infer<typeof PinnedRecordingSchema>;

const PinsResponseSchema = z.object({
  count: z.number().optional(),
  offset: z.number().optional(),
  total_count: z.number().optional(),
  user_name: z.string().optional(),
  pinned_recordings: z.array(PinnedRecordingSchema),
});

/**
 * The user's currently-active pin (pinned_until > now).
 *
 * LB ships a /pins/current-pin endpoint, but it 404s even for users with
 * a real active pin (verified against jherskowitz, who has an unexpired
 * pin in /pins). Derive the active pin from /pins?count=1 instead — same
 * data, one request, actually works.
 */
export async function getCurrentPin(
  userName: string,
): Promise<PinnedRecording | null> {
  const recent = await getUserPins(userName, 1);
  const latest = recent[0];
  if (!latest) return null;
  const now = Math.floor(Date.now() / 1000);
  return latest.pinned_until > now ? latest : null;
}

/** Full pin history for a user, newest first. */
export async function getUserPins(
  userName: string,
  count = 25,
): Promise<PinnedRecording[]> {
  try {
    const params = new URLSearchParams({ count: String(count) });
    const result = await lbFetch(
      `/${encodeURIComponent(userName)}/pins?${params}`,
      PinsResponseSchema,
      { revalidate: 60 * 5, tags: [`lb:user:${userName}:pins`] },
    );
    return result.pinned_recordings;
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

// ─── Recommendations ────────────────────────────────────────────────

const CfRecommendationSchema = z.object({
  payload: z.object({
    count: z.number().optional(),
    entity: z.string().optional(),
    last_updated: z.number().optional(),
    mbids: z.array(
      z.object({
        recording_mbid: z.string(),
        score: z.number().optional(),
        latest_listened_at: z.string().nullish(),
      }),
    ),
  }),
});

export interface RecommendedRecordingMbid {
  recording_mbid: string;
  score: number;
  latest_listened_at: string | null;
}

export async function getRecommendedRecordings(
  userName: string,
  count = 25,
  artistType: "top" | "similar" | "raw" = "raw",
): Promise<RecommendedRecordingMbid[]> {
  try {
    const params = new URLSearchParams({
      count: String(count),
      artist_type: artistType,
    });
    const result = await lbFetch(
      `/cf/recommendation/user/${encodeURIComponent(userName)}/recording?${params}`,
      CfRecommendationSchema,
      {
        revalidate: 60 * 60,
        tags: [`lb:user:${userName}:cf-recordings`],
      },
    );
    return result.payload.mbids.map((m) => ({
      recording_mbid: m.recording_mbid,
      score: m.score ?? 0,
      latest_listened_at: m.latest_listened_at ?? null,
    }));
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

const RecordingMetadataEntrySchema = z.object({
  artist: z
    .object({
      artist_credit_id: z.number().optional(),
      name: z.string().optional(),
      artists: z
        .array(
          z
            .object({
              artist_mbid: z.string(),
              name: z.string(),
              join_phrase: z.string().optional(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  recording: z
    .object({
      name: z.string().optional(),
      length: z.number().optional(),
      first_release_date: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  release: z
    .object({
      name: z.string().optional(),
      mbid: z.string().optional(),
      caa_id: z.union([z.number(), z.string()]).optional(),
      caa_release_mbid: z.string().optional(),
      release_group_mbid: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
});

export type RecordingMetadata = z.infer<typeof RecordingMetadataEntrySchema>;

export async function getRecordingMetadata(
  recordingMbids: string[],
): Promise<Map<string, RecordingMetadata>> {
  const out = new Map<string, RecordingMetadata>();
  if (recordingMbids.length === 0) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < recordingMbids.length; i += 50) {
    chunks.push(recordingMbids.slice(i, i + 50));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        // LB's `inc` param expects a literal `+` between values. URLSearchParams
        // would encode it as %2B, which the API rejects with a 400 ("invalid
        // inc argument 'artist+release'"). Build the query string by hand so
        // the plus survives.
        const mbids = encodeURIComponent(chunk.join(","));
        const url = `${LB_BASE}/metadata/recording/?recording_mbids=${mbids}&inc=artist+release`;
        const res = await fetchWithTimeout(url, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
          },
          next: {
            revalidate: 60 * 60 * 6,
            tags: ["lb:metadata:recording"],
          },
        });
        if (!res.ok) return;
        const json = (await res.json()) as Record<string, unknown>;
        for (const [mbid, raw] of Object.entries(json)) {
          const parsed = RecordingMetadataEntrySchema.safeParse(raw);
          if (parsed.success) out.set(mbid, parsed.data);
        }
      } catch {
        // Best-effort — leave the chunk un-enriched.
      }
    }),
  );
  return out;
}

const SimilarUserSchema = z.object({
  user_name: z.string(),
  similarity: z.number(),
});

const SimilarUsersResponseSchema = z.object({
  payload: z.array(SimilarUserSchema),
});

export type SimilarUser = z.infer<typeof SimilarUserSchema>;

export async function getSimilarUsers(
  userName: string,
  limit = 12,
): Promise<SimilarUser[]> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(userName)}/similar-users`,
      SimilarUsersResponseSchema,
      {
        revalidate: 60 * 60,
        tags: [`lb:user:${userName}:similar-users`],
      },
    );
    return result.payload
      .slice()
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

// ─── Social: follow / unfollow ──────────────────────────────────────

const FollowingSchema = z.object({
  following: z.array(z.string()),
});

const FollowersSchema = z.object({
  followers: z.array(z.string()),
});

export async function getFollowing(userName: string): Promise<string[]> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(userName)}/following`,
      FollowingSchema,
      { revalidate: 60, tags: [`lb:user:${userName}:following`] },
    );
    return result.following;
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

export async function getFollowers(userName: string): Promise<string[]> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(userName)}/followers`,
      FollowersSchema,
      { revalidate: 60, tags: [`lb:user:${userName}:followers`] },
    );
    return result.followers;
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

/**
 * Followers list for the "Recommend to followers" picker. Same endpoint
 * as `getFollowers` but with a longer revalidate window — the picker
 * tolerates a few minutes of staleness in exchange for fewer LB hits
 * across the many places it could be opened from.
 */
export async function getUserFollowers(username: string): Promise<string[]> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(username)}/followers`,
      FollowersSchema,
      { revalidate: 600, tags: [`lb:user:${username}:followers`] },
    );
    return result.followers;
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

interface FollowResult {
  ok: boolean;
  status: number;
  /** Server-provided message when present (used for error display). */
  message?: string;
  /**
   * True for the "already following" / "not following" idempotency case
   * — the desired end state already holds, so the UI should treat it as
   * success.
   */
  noop?: boolean;
}

async function lbFollowMutation(
  path: "follow" | "unfollow",
  target: string,
  token: string,
): Promise<FollowResult> {
  const res = await fetchWithTimeout(
    `${LB_BASE}/user/${encodeURIComponent(target)}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  let message: string | undefined;
  let noop = false;
  // LB returns JSON like {status: "ok"} on success, or {code, error} on failure.
  try {
    const body = (await res.json()) as { status?: string; error?: string };
    if (body.error) {
      message = body.error;
      // Treat already-followed / not-followed as no-op success — the
      // toggle's desired end state already holds.
      if (
        /already following/i.test(body.error) ||
        /not following/i.test(body.error)
      ) {
        noop = true;
      }
    }
  } catch {
    // No-op — non-JSON body, just return based on status.
  }
  return {
    ok: res.ok || noop,
    status: res.status,
    message,
    noop,
  };
}

export async function followUser(
  target: string,
  token: string,
): Promise<FollowResult> {
  return lbFollowMutation("follow", target, token);
}

export async function unfollowUser(
  target: string,
  token: string,
): Promise<FollowResult> {
  return lbFollowMutation("unfollow", target, token);
}

// ─── User stats ─────────────────────────────────────────────────────

export {
  STAT_RANGES,
  STAT_RANGE_LABELS,
  type StatRange,
} from "@/lib/types/stat-range";
import type { StatRange } from "@/lib/types/stat-range";

const StatTopArtistsSchema = z.object({
  payload: z.object({
    artists: z.array(
      z.object({
        artist_name: z.string(),
        artist_mbid: z.string().nullish(),
        listen_count: z.number(),
      }),
    ),
    count: z.number().optional(),
    range: z.string(),
    last_updated: z.number().optional(),
    total_artist_count: z.number().optional(),
    from_ts: z.number().optional(),
    to_ts: z.number().optional(),
  }),
});

export async function getUserTopArtists(
  name: string,
  range: StatRange = "all_time",
  count = 25,
) {
  try {
    const params = new URLSearchParams({ range, count: String(count) });
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(name)}/artists?${params}`,
      StatTopArtistsSchema,
      { revalidate: 60 * 60, tags: [cacheTagsLB.userStats(name)] },
    );
    return result.payload.artists;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 204) return [];
    throw err;
  }
}

/**
 * Cheap fetch for "how many distinct artists has this user ever
 * listened to" without pulling the full top-artists list. LB's
 * top-artists response includes a `total_artist_count` field
 * alongside the (paginated) array — request count=1 to keep the
 * payload tiny and read just that number.
 *
 * Used by the listener-milestones chip to render an exact count
 * instead of the previous ">500 artists" floor (which was a
 * workaround for capping `getUserTopArtists` at 500 rows and
 * reading `.length`). See issue #61.
 *
 * Returns `null` when LB doesn't include the field (older
 * deployments) so callers can fall back to a less-precise chip.
 */
export async function getUserDistinctArtistCount(
  name: string,
  range: StatRange = "all_time",
): Promise<number | null> {
  try {
    const params = new URLSearchParams({ range, count: "1" });
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(name)}/artists?${params}`,
      StatTopArtistsSchema,
      { revalidate: 60 * 60, tags: [cacheTagsLB.userStats(name)] },
    );
    return result.payload.total_artist_count ?? null;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 204) return 0;
    return null;
  }
}

const StatTopReleaseGroupsSchema = z.object({
  payload: z.object({
    release_groups: z.array(
      z.object({
        release_group_name: z.string(),
        release_group_mbid: z.string().nullish(),
        artist_name: z.string(),
        artist_mbids: z.array(z.string()).optional(),
        listen_count: z.number(),
        caa_id: z.union([z.number(), z.string()]).nullish(),
        caa_release_mbid: z.string().nullish(),
      }),
    ),
    count: z.number().optional(),
    range: z.string(),
    total_release_group_count: z.number().optional(),
  }),
});

export async function getUserTopReleaseGroups(
  name: string,
  range: StatRange = "all_time",
  count = 24,
) {
  try {
    const params = new URLSearchParams({ range, count: String(count) });
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(name)}/release-groups?${params}`,
      StatTopReleaseGroupsSchema,
      { revalidate: 60 * 60, tags: [cacheTagsLB.userStats(name)] },
    );
    return result.payload.release_groups;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 204) return [];
    throw err;
  }
}

const StatTopRecordingsSchema = z.object({
  payload: z.object({
    recordings: z.array(
      z.object({
        track_name: z.string(),
        recording_mbid: z.string().nullish(),
        artist_name: z.string(),
        artist_mbids: z.array(z.string()).optional(),
        release_name: z.string().nullish(),
        release_mbid: z.string().nullish(),
        listen_count: z.number(),
        caa_id: z.union([z.number(), z.string()]).nullish(),
        caa_release_mbid: z.string().nullish(),
      }),
    ),
    count: z.number().optional(),
    range: z.string(),
    total_recording_count: z.number().optional(),
  }),
});

export async function getUserTopRecordings(
  name: string,
  range: StatRange = "all_time",
  count = 25,
) {
  try {
    const params = new URLSearchParams({ range, count: String(count) });
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(name)}/recordings?${params}`,
      StatTopRecordingsSchema,
      { revalidate: 60 * 60, tags: [cacheTagsLB.userStats(name)] },
    );
    return result.payload.recordings;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 204) return [];
    throw err;
  }
}

const ListeningActivitySchema = z.object({
  payload: z.object({
    listening_activity: z.array(
      z.object({
        from_ts: z.number(),
        to_ts: z.number(),
        listen_count: z.number(),
        time_range: z.string(),
      }),
    ),
    range: z.string(),
    last_updated: z.number().optional(),
  }),
});

export async function getListeningActivity(
  name: string,
  range: StatRange = "year",
) {
  try {
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(name)}/listening-activity?range=${range}`,
      ListeningActivitySchema,
      { revalidate: 60 * 60, tags: [cacheTagsLB.userStats(name)] },
    );
    return result.payload.listening_activity;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 204) return [];
    throw err;
  }
}

const DailyActivitySchema = z.object({
  payload: z.object({
    daily_activity: z.record(
      z.string(),
      z.array(
        z.object({
          hour: z.number(),
          listen_count: z.number(),
        }),
      ),
    ),
    range: z.string(),
    last_updated: z.number().optional(),
    from_ts: z.number().optional(),
    to_ts: z.number().optional(),
  }),
});

export async function getDailyActivity(
  name: string,
  range: StatRange = "all_time",
) {
  try {
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(name)}/daily-activity?range=${range}`,
      DailyActivitySchema,
      { revalidate: 60 * 60, tags: [cacheTagsLB.userStats(name)] },
    );
    return result.payload.daily_activity;
  } catch (err) {
    if (err instanceof ListenBrainzError && err.status === 204) return {};
    throw err;
  }
}

const TopReleaseGroupForArtistSchema = z.object({
  release_group_mbid: z.string(),
  release_group_name: z.string(),
  artist_name: z.string(),
  artist_mbids: z.array(z.string()).optional(),
  caa_id: z.union([z.number(), z.string()]).nullish(),
  caa_release_mbid: z.string().nullish(),
  total_listen_count: z.number().optional(),
  total_user_count: z.number().optional(),
});

export type TopReleaseGroup = z.infer<typeof TopReleaseGroupForArtistSchema>;

const ReleaseGroupListenersSchema = z.object({
  payload: z.object({
    release_group_mbid: z.string(),
    release_group_name: z.string().optional(),
    artist_name: z.string().optional(),
    artist_mbids: z.array(z.string()).optional(),
    total_listen_count: z.number().optional(),
    total_user_count: z.number().optional(),
    listeners: z
      .array(z.object({ user_name: z.string(), listen_count: z.number() }))
      .optional(),
  }),
});

export type ReleaseGroupListeners = z.infer<typeof ReleaseGroupListenersSchema>["payload"];

export async function getReleaseGroupListeners(
  mbid: string,
): Promise<ReleaseGroupListeners | null> {
  try {
    const result = await lbFetch(
      `/stats/release-group/${encodeURIComponent(mbid)}/listeners`,
      ReleaseGroupListenersSchema,
      { revalidate: 60 * 60 * 6 },
    );
    return result.payload;
  } catch (err) {
    if (err instanceof ListenBrainzError && (err.status === 204 || err.status === 404)) {
      return null;
    }
    throw err;
  }
}

// LB doesn't expose a single-recording listener-count GET; the only
// path is the POST batch popularity endpoint that takes an array of
// recording mbids and returns aggregate listen / user counts.

const RecordingPopularityResponseSchema = z.array(
  z
    .object({
      recording_mbid: z.string(),
      total_listen_count: z.number().optional(),
      total_user_count: z.number().optional(),
    })
    .passthrough(),
);

const ReleaseGroupPopularityResponseSchema = z.array(
  z
    .object({
      release_group_mbid: z.string(),
      total_listen_count: z.number().optional(),
      total_user_count: z.number().optional(),
    })
    .passthrough(),
);

const ArtistPopularityResponseSchema = z.array(
  z
    .object({
      artist_mbid: z.string(),
      total_listen_count: z.number().optional(),
      total_user_count: z.number().optional(),
    })
    .passthrough(),
);

export interface RecordingPopularity {
  totalListenCount: number;
  totalUserCount: number;
}

/**
 * Batch popularity lookup for an array of MBIDs of any of three
 * entity kinds. LB's `/popularity/{recording,release-group,artist}`
 * endpoints all accept the same shape — a single POST with an
 * mbids array — and return rows of total_listen_count /
 * total_user_count per item. We use this to sort search results by
 * popularity in one network round-trip per kind instead of N.
 *
 * Returns a Map<mbid, total_listen_count>; missing entries imply
 * "no listens recorded" → effectively rank-zero in the sort. Failed
 * fetches return an empty Map so callers fall back to MB's natural
 * search order.
 */
async function fetchPopularityBatch(
  kind: "recording" | "release-group" | "artist",
  mbids: string[],
): Promise<Map<string, number>> {
  if (mbids.length === 0) return new Map();
  const bodyKey =
    kind === "recording"
      ? "recording_mbids"
      : kind === "release-group"
        ? "release_group_mbids"
        : "artist_mbids";
  const idKey = `${kind === "release-group" ? "release_group" : kind}_mbid`;
  try {
    const res = await fetchWithTimeout(`${LB_BASE}/popularity/${kind}`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ [bodyKey]: mbids }),
      // Short cache — popularity drifts slowly enough that a 6h
      // window is fine, and the cache key is per-mbid-list so
      // common queries get re-served quickly.
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const schema =
      kind === "recording"
        ? RecordingPopularityResponseSchema
        : kind === "release-group"
          ? ReleaseGroupPopularityResponseSchema
          : ArtistPopularityResponseSchema;
    const parsed = schema.safeParse(json);
    if (!parsed.success) return new Map();
    const out = new Map<string, number>();
    for (const row of parsed.data) {
      const id = (row as Record<string, unknown>)[idKey] as string;
      out.set(id, row.total_listen_count ?? 0);
    }
    return out;
  } catch {
    return new Map();
  }
}

export function getRecordingPopularityBatch(mbids: string[]) {
  return fetchPopularityBatch("recording", mbids);
}
export function getReleaseGroupPopularityBatch(mbids: string[]) {
  return fetchPopularityBatch("release-group", mbids);
}
export function getArtistPopularityBatch(mbids: string[]) {
  return fetchPopularityBatch("artist", mbids);
}

export async function getRecordingPopularity(
  mbid: string,
): Promise<RecordingPopularity | null> {
  try {
    const url = `${LB_BASE}/popularity/recording`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recording_mbids: [mbid] }),
      next: {
        revalidate: 60 * 60 * 6,
        tags: [cacheTagsLB.recording(mbid)],
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = RecordingPopularityResponseSchema.safeParse(json);
    if (!parsed.success || parsed.data.length === 0) return null;
    const item = parsed.data[0];
    return {
      totalListenCount: item.total_listen_count ?? 0,
      totalUserCount: item.total_user_count ?? 0,
    };
  } catch {
    return null;
  }
}

const ArtistListenersSchema = z.object({
  payload: z.object({
    artist_mbid: z.string(),
    artist_name: z.string().optional(),
    total_listen_count: z.number().optional(),
    total_user_count: z.number().optional(),
    listeners: z
      .array(z.object({ user_name: z.string(), listen_count: z.number() }))
      .optional(),
  }),
});

export type ArtistListeners = z.infer<typeof ArtistListenersSchema>["payload"];

// ─── Fresh releases ─────────────────────────────────────────────────

const FreshReleaseSchema = z.object({
  release_name: z.string(),
  artist_credit_name: z.string(),
  artist_mbids: z.array(z.string()).optional(),
  release_mbid: z.string(),
  release_group_mbid: z.string().nullish(),
  release_group_primary_type: z.string().nullish(),
  release_group_secondary_type: z.string().nullish(),
  release_date: z.string(),
  caa_id: z.union([z.number(), z.string()]).nullish(),
  caa_release_mbid: z.string().nullish(),
  listen_count: z.number().optional(),
  confidence: z.number().optional(),
  release_tags: z.array(z.string()).optional(),
});

export type FreshRelease = z.infer<typeof FreshReleaseSchema>;

const FreshReleasesSchema = z.object({
  payload: z.object({
    releases: z.array(FreshReleaseSchema),
    total_count: z.number().optional(),
  }),
});

export interface FreshReleasesOptions {
  days?: number;
  sort?: "release_date" | "confidence" | "artist_credit_name";
  past?: boolean;
  future?: boolean;
}

function freshParams(opts?: FreshReleasesOptions): string {
  const params = new URLSearchParams();
  if (opts?.days) params.set("days", String(opts.days));
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.past !== undefined) params.set("past", String(opts.past));
  if (opts?.future !== undefined) params.set("future", String(opts.future));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Sitewide fresh releases — global firehose for the past N days. */
export async function getFreshReleases(
  opts?: FreshReleasesOptions,
): Promise<FreshRelease[]> {
  const result = await lbFetch(
    `/explore/fresh-releases/${freshParams(opts)}`,
    FreshReleasesSchema,
    { revalidate: 60 * 30, tags: ["lb:fresh-releases"] },
  );
  return result.payload.releases;
}

/** Per-user fresh releases — filtered to artists the user has listened to. */
export async function getUserFreshReleases(
  userName: string,
  opts?: FreshReleasesOptions,
): Promise<FreshRelease[]> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(userName)}/fresh_releases${freshParams(opts)}`,
      FreshReleasesSchema,
      {
        revalidate: 60 * 30,
        tags: [`lb:user:${userName}:fresh-releases`],
      },
    );
    return result.payload.releases;
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return [];
    }
    throw err;
  }
}

// ─── LB Radio ───────────────────────────────────────────────────────

const LbRadioTrackSchema = z
  .object({
    title: z.string(),
    creator: z.string().optional(),
    album: z.string().nullish(),
    duration: z.number().nullish(),
    identifier: z.union([z.string(), z.array(z.string())]).optional(),
    extension: z
      .object({
        "https://musicbrainz.org/doc/jspf#track": z
          .object({
            release_identifier: z.string().nullish(),
            artist_identifiers: z.array(z.string()).optional(),
            additional_metadata: z
              .object({
                caa_id: z.union([z.number(), z.string()]).nullish(),
                caa_release_mbid: z.string().nullish(),
              })
              .partial()
              .passthrough()
              .optional(),
          })
          .partial()
          .passthrough()
          .optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

const LbRadioResponseSchema = z.object({
  payload: z.object({
    jspf: z.object({
      playlist: z.object({
        title: z.string().optional(),
        annotation: z.string().optional(),
        track: z.array(LbRadioTrackSchema).optional(),
      }),
    }),
  }),
});

export interface LbRadioTrack {
  title: string;
  artistName: string;
  artistMbid: string | null;
  recordingMbid: string | null;
  releaseMbid: string | null;
  releaseName: string | null;
  durationMs: number | null;
  caaId: number | string | null;
  caaReleaseMbid: string | null;
}

const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractMbid(
  value: string | undefined | null,
  kind: "artist" | "recording" | "release",
): string | null {
  if (!value) return null;
  // LB sometimes hands back bare UUIDs (e.g. artist_identifiers) and
  // sometimes full musicbrainz.org URLs (recording/release identifier).
  // Support both rather than silently returning null on the bare form.
  if (MBID_RE.test(value)) return value.toLowerCase();
  const m = value.match(new RegExp(`/${kind}/([0-9a-f-]{36})`));
  return m?.[1] ?? null;
}

/** Convert a JSPF track (LB Radio / playlist track shape) to our flat type. */
function jspfTrackToLbRadioTrack(
  t: z.infer<typeof LbRadioTrackSchema>,
): LbRadioTrack {
  const ext = t.extension?.["https://musicbrainz.org/doc/jspf#track"];
  const idArr = Array.isArray(t.identifier)
    ? t.identifier
    : t.identifier
      ? [t.identifier]
      : [];
  // LB Radio tracks carry release_identifier; LB user-playlist tracks
  // don't, but they include caa_release_mbid in additional_metadata.
  // Either is a valid release MBID for our linking purposes.
  const releaseMbid =
    extractMbid(ext?.release_identifier, "release") ??
    ext?.additional_metadata?.caa_release_mbid ??
    null;
  return {
    title: t.title,
    artistName: t.creator ?? "",
    artistMbid: extractMbid(ext?.artist_identifiers?.[0], "artist"),
    recordingMbid: extractMbid(idArr[0], "recording"),
    releaseMbid,
    releaseName: t.album ?? null,
    durationMs: t.duration ?? null,
    caaId: ext?.additional_metadata?.caa_id ?? null,
    caaReleaseMbid: ext?.additional_metadata?.caa_release_mbid ?? null,
  };
}

/**
 * Pre-process an LB Radio prompt so common user input shapes work.
 *
 * LB's parser rejects spaces inside `tag:(...)` and `country:(...)`
 * (returns "An unknown error occured"), but it happily accepts the
 * hyphenated form — `tag:(indie-rock)` works the same as the raw MB
 * tag "indie rock". So users typing the tag the way they'd say it out
 * loud doesn't fail. Comma-separated values are preserved.
 */
function normaliseRadioPrompt(prompt: string): string {
  // `\s*` between the colon and the paren so users can type
  // "tag: (indie rock)" or "tag:(indie rock)" — both normalise to
  // "tag:(indie-rock)". Output always uses the no-space canonical form
  // since LB's parser is strict about it.
  return prompt.replace(
    /\b(tag|country|artist):\s*\(([^)]*)\)/gi,
    (_, prefix: string, body: string) => {
      const lower = prefix.toLowerCase();
      // Don't touch artist:(<mbid>) — bare UUIDs shouldn't be hyphenated.
      if (lower === "artist") return `${lower}:(${body.trim()})`;
      const cleaned = body
        .split(",")
        .map((part) => part.trim().replace(/\s+/g, "-"))
        .filter(Boolean)
        .join(",");
      return `${lower}:(${cleaned})`;
    },
  );
}

export async function getLbRadio(
  prompt: string,
  mode: "easy" | "medium" | "hard" = "easy",
): Promise<LbRadioTrack[] | null> {
  const result = await tryGetLbRadio(prompt, mode);
  return result.ok ? result.tracks : null;
}

export type LbRadioResult =
  | { ok: true; tracks: LbRadioTrack[] }
  | { ok: false; error: string };

/**
 * Same as getLbRadio but surfaces LB's actual error message when the
 * request fails — used by the /radio page's station builder so users
 * see "cannot parse prompt" instead of a generic blank.
 */
export async function tryGetLbRadio(
  prompt: string,
  mode: "easy" | "medium" | "hard" = "easy",
): Promise<LbRadioResult> {
  const { getLbTokenForRequest } = await import("@/lib/lb-token");
  const token = await getLbTokenForRequest();
  if (!token) {
    return {
      ok: false,
      error: "ListenBrainz token missing — add one in Settings → Connections.",
    };
  }

  const normalised = normaliseRadioPrompt(prompt);
  const params = new URLSearchParams({ prompt: normalised, mode });
  try {
    const res = await fetchWithTimeout(`${LB_BASE}/explore/lb-radio?${params}`, {
      headers: {
        Authorization: `Token ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      next: {
        revalidate: 60 * 60,
        tags: [`lb:radio:${normalised}:${mode}`],
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      const msg =
        body?.error ??
        body?.message ??
        `ListenBrainz returned ${res.status}.`;
      // LB sometimes prefixes with "LB Radio generation failed:" — keep
      // the prefix since it cues the user that this came from LB.
      return { ok: false, error: msg };
    }
    const data = LbRadioResponseSchema.parse(await res.json());
    const tracks = (data.payload.jspf.playlist.track ?? []).map(
      jspfTrackToLbRadioTrack,
    );
    return { ok: true, tracks };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}

// ─── Single playlist (with tracks) ──────────────────────────────────

const PlaylistDetailResponseSchema = z.object({
  playlist: z
    .object({
      title: z.string(),
      creator: z.string().optional(),
      annotation: z.string().nullish(),
      date: z.string().optional(),
      identifier: z.string().optional(),
      extension: z
        .object({
          "https://musicbrainz.org/doc/jspf#playlist":
            PlaylistExtensionSchema.optional(),
        })
        .partial()
        .passthrough()
        .optional(),
      track: z.array(LbRadioTrackSchema).optional(),
    })
    .passthrough(),
});

export interface PlaylistDetail {
  title: string;
  creator: string | null;
  annotation: string | null;
  date: string | null;
  isPublic: boolean;
  algorithmSource: string | null;
  collaborators: string[];
  externalUrls: Record<string, string>;
  tracks: LbRadioTrack[];
}

export async function getPlaylist(
  mbid: string,
  /** Pass the viewer's LB token to fetch a *private* playlist (LB
   *  returns 404 to unauthenticated viewers). Public playlists work
   *  with or without a token. */
  token?: string,
): Promise<PlaylistDetail | null> {
  try {
    const result = await lbFetch(
      `/playlist/${encodeURIComponent(mbid)}`,
      PlaylistDetailResponseSchema,
      token
        ? { token }
        : { revalidate: 60 * 5, tags: [`lb:playlist:${mbid}`] },
    );
    const p = result.playlist;
    const ext = p.extension?.["https://musicbrainz.org/doc/jspf#playlist"];
    return {
      title: p.title,
      creator: p.creator ?? ext?.creator ?? null,
      annotation: p.annotation ?? null,
      date: p.date ?? null,
      isPublic: ext?.public ?? true,
      algorithmSource:
        ext?.additional_metadata?.algorithm_metadata?.source_patch ?? null,
      collaborators: ext?.collaborators ?? [],
      externalUrls: ext?.additional_metadata?.external_urls ?? {},
      tracks: (p.track ?? []).map(jspfTrackToLbRadioTrack),
    };
  } catch (err) {
    if (
      err instanceof ListenBrainzError &&
      (err.status === 204 || err.status === 404)
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Edit a playlist's metadata (title, description, visibility,
 * collaborators).
 *
 * LB exposes `POST /1/playlist/edit/{mbid}` accepting a partial JSPF
 * body — the handler reads each field with a `try/except KeyError`,
 * so any field omitted from the body is left alone. Two sharp edges:
 *
 *   1. The `collaborators` list is rebuilt from whatever the body
 *      contains. If you send an `extension` object without
 *      `collaborators`, LB defaults it to `[]` and silently clears
 *      the existing list. We always pass the current collaborators
 *      through to be safe.
 *   2. `annotation` of `null` is treated as "no change". To clear
 *      the description you send `""`.
 *
 * Returns `{ ok: true }` on 200, `{ ok: false, status, message }`
 * otherwise. 403 = not the owner; 401 = bad/missing token.
 *
 * Source: github.com/metabrainz/listenbrainz-server  →
 *   listenbrainz/webserver/views/playlist_api.py::edit_playlist
 */
export interface PlaylistEditFields {
  title?: string;
  /** Pass `""` to clear the description; `undefined` to leave it. */
  annotation?: string;
  isPublic?: boolean;
  /** Required when sending any extension change — see note above. */
  collaborators?: string[];
}

export async function editPlaylist(
  mbid: string,
  fields: PlaylistEditFields,
  token: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const body: { playlist: Record<string, unknown> } = { playlist: {} };
  if (fields.title !== undefined) body.playlist.title = fields.title;
  if (fields.annotation !== undefined)
    body.playlist.annotation = fields.annotation;
  if (fields.isPublic !== undefined || fields.collaborators !== undefined) {
    const ext: Record<string, unknown> = {};
    if (fields.isPublic !== undefined) ext.public = fields.isPublic;
    if (fields.collaborators !== undefined)
      ext.collaborators = fields.collaborators;
    body.playlist.extension = {
      "https://musicbrainz.org/doc/jspf#playlist": ext,
    };
  }
  const res = await fetchWithTimeout(
    `${LB_BASE}/playlist/edit/${encodeURIComponent(mbid)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  let message: string | undefined;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {
    // Non-JSON body — fall back to status.
  }
  return { ok: res.ok, status: res.status, message };
}

/** Convenience wrapper for the visibility-only toggle. */
export function setPlaylistVisibility(
  mbid: string,
  isPublic: boolean,
  collaborators: string[],
  token: string,
) {
  return editPlaylist(mbid, { isPublic, collaborators }, token);
}

/**
 * Permanently delete a playlist on ListenBrainz. Endpoint is
 * `POST /1/playlist/<mbid>/delete` — no body required. LB returns
 * 200 on success and 404 if the playlist doesn't exist (already
 * gone, or the caller never owned it). The token must belong to
 * the playlist's creator; collaborators can't delete.
 *
 * No way to undelete on LB's side, so callers should confirm
 * destructive intent before invoking.
 */
export async function deletePlaylist(
  mbid: string,
  token: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetchWithTimeout(
    `${LB_BASE}/playlist/${encodeURIComponent(mbid)}/delete`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  let message: string | undefined;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {
    // Non-JSON body — fall back to status.
  }
  return { ok: res.ok, status: res.status, message };
}

// ─── Similar artists (LB Labs) ──────────────────────────────────────

const SIMILAR_ARTISTS_ALGORITHM =
  "session_based_days_7500_session_300_contribution_3_threshold_10_limit_100_filter_True_skip_30";

const SimilarArtistSchema = z.object({
  artist_mbid: z.string(),
  name: z.string(),
  comment: z.string().nullish(),
  type: z.string().nullish(),
  score: z.number(),
  reference_mbid: z.string().optional(),
});

export type SimilarArtist = z.infer<typeof SimilarArtistSchema>;

export async function getSimilarArtists(
  mbid: string,
  limit = 12,
): Promise<SimilarArtist[]> {
  try {
    const res = await fetchWithTimeout(`${LB_LABS_BASE}/similar-artists/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify([
        { artist_mbids: [mbid], algorithm: SIMILAR_ARTISTS_ALGORITHM },
      ]),
      next: {
        revalidate: 60 * 60 * 24,
        tags: [`lb:similar-artists:${mbid}`],
      },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const parsed = z.array(SimilarArtistSchema).safeParse(json);
    if (!parsed.success) return [];
    // LB returns the seed artist first sometimes — filter it
    return parsed.data
      .filter((a) => a.artist_mbid !== mbid)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function getArtistListeners(
  mbid: string,
): Promise<ArtistListeners | null> {
  try {
    const result = await lbFetch(
      `/stats/artist/${encodeURIComponent(mbid)}/listeners`,
      ArtistListenersSchema,
      { revalidate: 60 * 60 * 6 },
    );
    return result.payload;
  } catch (err) {
    if (err instanceof ListenBrainzError && (err.status === 204 || err.status === 404)) {
      return null;
    }
    throw err;
  }
}

export async function getTopReleaseGroupsForArtist(
  artistMbid: string,
): Promise<TopReleaseGroup[]> {
  try {
    const result = await lbFetch(
      `/popularity/top-release-groups-for-artist/${encodeURIComponent(artistMbid)}`,
      z.array(TopReleaseGroupForArtistSchema),
      { revalidate: 60 * 60 * 6 },
    );
    return result;
  } catch {
    return [];
  }
}

// ---- Year in Music ----

const YimArtistEntrySchema = z
  .object({
    artist_mbid: z.string().nullish(),
    artist_name: z.string(),
    listen_count: z.number(),
  })
  .passthrough();

const YimRecordingEntrySchema = z
  .object({
    recording_mbid: z.string().nullish(),
    track_name: z.string().optional(),
    artist_name: z.string().optional(),
    artist_mbids: z.array(z.string()).optional(),
    release_name: z.string().nullish(),
    release_mbid: z.string().nullish(),
    listen_count: z.number(),
    caa_id: z.union([z.number(), z.string()]).nullish(),
    caa_release_mbid: z.string().nullish(),
  })
  .passthrough();

const YimReleaseGroupEntrySchema = z
  .object({
    release_group_name: z.string(),
    release_group_mbid: z.string().nullish(),
    artist_name: z.string(),
    artist_mbids: z.array(z.string()).optional(),
    listen_count: z.number(),
    caa_id: z.union([z.number(), z.string()]).nullish(),
    caa_release_mbid: z.string().nullish(),
  })
  .passthrough();

const YimNewReleaseSchema = z
  .object({
    artist_credit_name: z.string(),
    artist_credit_mbids: z.array(z.string()).optional(),
    title: z.string(),
    release_group_mbid: z.string().nullish(),
    caa_id: z.union([z.number(), z.string()]).nullish(),
    caa_release_mbid: z.string().nullish(),
  })
  .passthrough();

const YimTopGenreSchema = z
  .object({
    genre: z.string(),
    genre_count: z.number(),
    genre_count_percent: z.number(),
  })
  .passthrough();

const YimListensPerDaySchema = z
  .object({
    from_ts: z.number(),
    to_ts: z.number(),
    listen_count: z.number(),
    time_range: z.string(),
  })
  .passthrough();

const YimArtistEvolutionSchema = z
  .object({
    artist_mbid: z.string().nullish(),
    artist_name: z.string(),
    listen_count: z.number(),
    time_unit: z.string(),
  })
  .passthrough();

// LB nests the JSPF playlist body directly here (not under a wrapping
// `playlist:` key like /createdfor/ does). Keep it loose.
const YimPlaylistSchema = z
  .object({
    title: z.string().optional(),
    creator: z.string().optional(),
    identifier: z.union([z.string(), z.array(z.string())]).optional(),
    annotation: z.string().nullish(),
    date: z.string().optional(),
    extension: z.record(z.string(), z.unknown()).optional(),
    track: z.array(z.unknown()).optional(),
  })
  .passthrough();

const YearInMusicDataSchema = z
  .object({
    artist_evolution_activity: z.array(YimArtistEvolutionSchema).optional(),
    day_of_week: z.string().optional(),
    listens_per_day: z.array(YimListensPerDaySchema).optional(),
    most_listened_year: z.record(z.string(), z.number()).optional(),
    new_releases_of_top_artists: z.array(YimNewReleaseSchema).optional(),
    "playlist-top-discoveries-for-year": YimPlaylistSchema.nullish(),
    "playlist-top-missed-recordings-for-year": YimPlaylistSchema.nullish(),
    similar_users: z.record(z.string(), z.number()).optional(),
    top_artists: z.array(YimArtistEntrySchema).optional(),
    top_genres: z.array(YimTopGenreSchema).optional(),
    top_recordings: z.array(YimRecordingEntrySchema).optional(),
    top_release_groups: z.array(YimReleaseGroupEntrySchema).optional(),
    total_artists_count: z.number().optional(),
    total_listen_count: z.number().optional(),
    total_listening_time: z.number().optional(),
    total_new_artists_discovered: z.number().optional(),
    total_recordings_count: z.number().optional(),
    total_release_groups_count: z.number().optional(),
  })
  .passthrough();

const YearInMusicResponseSchema = z.object({
  payload: z.object({
    data: YearInMusicDataSchema,
    user_id: z.string().optional(),
  }),
});

export type YearInMusicData = z.infer<typeof YearInMusicDataSchema>;
export type YimTopArtist = z.infer<typeof YimArtistEntrySchema>;
export type YimTopRecording = z.infer<typeof YimRecordingEntrySchema>;
export type YimTopReleaseGroup = z.infer<typeof YimReleaseGroupEntrySchema>;
export type YimNewRelease = z.infer<typeof YimNewReleaseSchema>;
export type YimTopGenre = z.infer<typeof YimTopGenreSchema>;
export type YimListensPerDay = z.infer<typeof YimListensPerDaySchema>;
export type YimArtistEvolution = z.infer<typeof YimArtistEvolutionSchema>;
export type YimPlaylist = z.infer<typeof YimPlaylistSchema>;

export async function getYearInMusic(
  userName: string,
  year: number,
): Promise<YearInMusicData | null> {
  try {
    const result = await lbFetch(
      `/stats/user/${encodeURIComponent(userName)}/year-in-music/${year}`,
      YearInMusicResponseSchema,
      {
        revalidate: 60 * 60 * 12,
        tags: [cacheTagsLB.userStats(userName)],
      },
    );
    return result.payload.data;
  } catch {
    return null;
  }
}

// ─── User feedback (loves / hates) ──────────────────────────────────

const FeedbackItemSchema = z
  .object({
    created: z.number(),
    /**
     * Loved tracks predate LB's MB-mapping work; older entries carry a
     * `recording_msid` (LB's internal id) but no `recording_mbid`.
     * Enriched lookups via `/metadata/recording/` only work for entries
     * with an MBID, so older loves render as plain text via the
     * track_metadata fallback when present.
     */
    recording_mbid: z.string().nullish(),
    recording_msid: z.string().nullish(),
    score: z.number(),
    track_metadata: ListenSchema.shape.track_metadata.nullish(),
  })
  .passthrough();

const FeedbackResponseSchema = z.object({
  count: z.number().optional(),
  total_count: z.number().optional(),
  feedback: z.array(FeedbackItemSchema),
});

export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

/**
 * Fetch a user's loved (`score=1`) or hated (`score=-1`) recordings
 * from LB. Public endpoint; no auth needed. Cached briefly so
 * profile-page revisits stay snappy without hiding fresh loves.
 */
export async function getUserFeedback(
  userName: string,
  opts: { score?: 1 | -1; count?: number; offset?: number } = {},
): Promise<FeedbackItem[]> {
  const params = new URLSearchParams();
  params.set("score", String(opts.score ?? 1));
  params.set("count", String(opts.count ?? 50));
  if (opts.offset) params.set("offset", String(opts.offset));
  try {
    const result = await lbFetch(
      `/feedback/user/${encodeURIComponent(userName)}/get-feedback?${params}`,
      FeedbackResponseSchema,
      {
        revalidate: 60 * 5,
        tags: [`lb:user:${userName}:feedback`, cacheTagsLB.user(userName)],
      },
    );
    return result.feedback;
  } catch {
    return [];
  }
}

/**
 * Set of recording MBIDs the user has loved (score=1). Optimised for
 * the track-actions menu, which checks "is this loved?" hundreds of
 * times per render and wants O(1) membership. Drops feedback rows
 * without a recording_mbid (older MSID-only entries) — the action
 * menu can't act on them anyway since the LB write API requires an
 * MBID.
 */
export async function getUserLovedRecordings(
  username: string,
): Promise<Set<string>> {
  const params = new URLSearchParams({ score: "1", count: "1000" });
  try {
    const result = await lbFetch(
      `/feedback/user/${encodeURIComponent(username)}/get-feedback?${params}`,
      FeedbackResponseSchema,
      {
        revalidate: 60,
        tags: [`lb:user:${username}:loved`, cacheTagsLB.user(username)],
      },
    );
    const out = new Set<string>();
    for (const f of result.feedback) {
      if (f.recording_mbid) out.add(f.recording_mbid);
    }
    return out;
  } catch {
    return new Set();
  }
}

// ─── User feed (events) ─────────────────────────────────────────────

// Schema is value-used via z.infer<typeof ...> below to derive the
// public FeedTrackMetadata type — the lint rule sees no value-side
// reference and flags it as unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FeedTrackMetadataSchema = z
  .object({
    track_name: z.string().optional(),
    artist_name: z.string().optional(),
    release_name: z.string().nullish(),
    additional_info: z
      .object({
        recording_mbid: z.string().nullish(),
        release_mbid: z.string().nullish(),
        artist_mbids: z.array(z.string()).nullish(),
        recording_msid: z.string().nullish(),
      })
      .partial()
      .passthrough()
      .optional(),
    mbid_mapping: z
      .object({
        recording_mbid: z.string().nullish(),
        release_mbid: z.string().nullish(),
        artist_mbids: z.array(z.string()).nullish(),
        caa_id: z.union([z.number(), z.string()]).nullish(),
        caa_release_mbid: z.string().nullish(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .partial()
  .passthrough();

// Each event type stuffs different shapes into `metadata`. Keep it
// loose with passthrough + per-type narrowing in the renderer.
const FeedEventSchema = z
  .object({
    id: z.union([z.number(), z.null()]).optional(),
    created: z.number(),
    event_type: z.string(),
    hidden: z.boolean().optional(),
    user_name: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const FeedResponseSchema = z.object({
  payload: z.object({
    count: z.number(),
    events: z.array(FeedEventSchema),
    user_id: z.string().optional(),
  }),
});

export type FeedEvent = z.infer<typeof FeedEventSchema>;
export type FeedTrackMetadata = z.infer<typeof FeedTrackMetadataSchema>;

/**
 * Synthetic event_type we emit for "user X loved track Y" rows
 * stitched into the feed from each followed user's `/feedback`
 * history. LB's native feed endpoint doesn't include loves, so we
 * mint these client-side and let the FeedEventList renderer
 * pattern-match on the type. Keeps the merge straightforward
 * (same FeedEvent shape) without a parallel data path.
 */
export const LOVED_RECORDING_EVENT_TYPE = "loved_recording";

/**
 * Fetch recent loves from each user in a `following` list and emit
 * them as synthetic FeedEvent entries. Used to splice loved-track
 * activity into the personal feed (LB's feed endpoint omits loves).
 *
 * Per-user fetch is cached at the LB-client layer (5 min revalidate),
 * so steady-state cost is a cache hit per friend. Cold cache fans
 * out N parallel calls; we cap at `maxUsers` (default 50) to bound
 * the per-render cost for users with very large follow lists.
 *
 * Each user's `lovesPerUser` (default 5) is the recent-love window
 * we pull. With 50 users × 5 loves = 250 candidate events, plenty
 * of room for the feed merge to cherry-pick the freshest ones.
 */
export async function getLovedRecordingEvents(
  following: string[],
  opts: { lovesPerUser?: number; maxUsers?: number } = {},
): Promise<FeedEvent[]> {
  const lovesPerUser = opts.lovesPerUser ?? 5;
  const maxUsers = opts.maxUsers ?? 50;
  if (following.length === 0) return [];
  const targets = following.slice(0, maxUsers);
  const fanOut = await Promise.all(
    targets.map(async (user) => {
      const items = await getUserFeedback(user, {
        score: 1,
        count: lovesPerUser,
      }).catch(() => [] as FeedbackItem[]);
      return items.map((item) => ({ user, item }));
    }),
  );
  const flat = fanOut.flat();
  // LB's /feedback endpoint frequently omits track_metadata on
  // older loves. Enrich any item missing it (but with a
  // recording_mbid) via /metadata/recording so the feed renders
  // real track names instead of "Unknown track" placeholders.
  const needsMeta = flat.filter(
    ({ item }) => !item.track_metadata && item.recording_mbid,
  );
  const enriched = needsMeta.length
    ? await getRecordingMetadata(
        needsMeta.map(({ item }) => item.recording_mbid as string),
      ).catch(() => new Map<string, RecordingMetadata>())
    : new Map<string, RecordingMetadata>();

  const events: FeedEvent[] = [];
  for (const { user, item } of flat) {
    let trackMeta = item.track_metadata ?? null;
    if (!trackMeta && item.recording_mbid) {
      const m = enriched.get(item.recording_mbid);
      if (m?.recording?.name && m?.artist?.name) {
        trackMeta = {
          track_name: m.recording.name,
          artist_name: m.artist.name,
          release_name: m.release?.name ?? null,
          additional_info: {
            recording_mbid: item.recording_mbid,
            ...(m.release?.mbid ? { release_mbid: m.release.mbid } : {}),
          },
          ...(m.release?.caa_id || m.release?.caa_release_mbid
            ? {
                mbid_mapping: {
                  recording_mbid: item.recording_mbid,
                  ...(m.release?.mbid
                    ? { release_mbid: m.release.mbid }
                    : {}),
                  ...(m.release?.caa_id
                    ? { caa_id: m.release.caa_id }
                    : {}),
                  ...(m.release?.caa_release_mbid
                    ? { caa_release_mbid: m.release.caa_release_mbid }
                    : {}),
                },
              }
            : {}),
        };
      }
    }
    if (!trackMeta) continue; // drop unresolvable loves
    events.push({
      id: null,
      created: item.created,
      event_type: LOVED_RECORDING_EVENT_TYPE,
      user_name: user,
      metadata: {
        track_metadata: trackMeta,
        recording_mbid: item.recording_mbid ?? null,
      },
    });
  }
  return events;
}

/**
 * Fetch the personal feed for a LB user. Requires that user's own
 * authentication token — LB only returns the feed for the token owner,
 * never for arbitrary users. Caller is responsible for ensuring the
 * passed userName matches the token's owner; if they don't,
 * LB returns 401/403 and this function returns null.
 *
 * Live-mode by default since feeds change with every follow/pin and
 * the page is rendered fresh on each visit.
 */
export async function getUserFeed(
  userName: string,
  token: string,
  opts: { count?: number; maxTs?: number; minTs?: number } = {},
): Promise<FeedEvent[] | null> {
  const params = new URLSearchParams();
  params.set("count", String(opts.count ?? 50));
  if (opts.minTs) params.set("min_ts", String(opts.minTs));
  if (opts.maxTs) params.set("max_ts", String(opts.maxTs));
  try {
    const res = await fetchWithTimeout(
      `${LB_BASE}/user/${encodeURIComponent(userName)}/feed/events?${params}`,
      {
        headers: {
          Authorization: `Token ${token}`,
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = FeedResponseSchema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data.payload.events;
  } catch {
    return null;
  }
}

// ─── Write helper ───────────────────────────────────────────────────

/**
 * Shared POST wrapper for LB write endpoints. Throws ListenBrainzError
 * on non-2xx with the response body included for debugging — callers
 * (typically server actions) should catch and surface the message.
 */
async function lbPost(path: string, token: string, body: unknown): Promise<void> {
  const res = await fetchWithTimeout(`${LB_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ListenBrainzError(
      res.status,
      `LB ${res.status} on ${path}: ${text.slice(0, 300)}`,
    );
  }
}

// ─── Recording feedback (love / hate / clear) ───────────────────────

/**
 * Submit a love (`1`), hate (`-1`), or clear (`0`) for a recording.
 * Idempotent on LB's side — re-sending the same score is a no-op.
 */
export async function submitFeedback(
  token: string,
  recordingMbid: string,
  score: 0 | 1 | -1,
): Promise<void> {
  await lbPost("/feedback/recording-feedback", token, {
    recording_mbid: recordingMbid,
    score,
  });
}

// ─── Pin a recording ────────────────────────────────────────────────

export interface SubmitPinOptions {
  recordingMbid?: string;
  recordingMsid?: string;
  blurb?: string;
  /** Unix seconds; LB defaults to 7 days when omitted. */
  pinnedUntil?: number;
}

/**
 * Pin a recording to the user's profile. LB requires at least one of
 * MBID / MSID — we validate at the entry to avoid a confusing 400.
 */
export async function submitPin(
  token: string,
  opts: SubmitPinOptions,
): Promise<void> {
  if (!opts.recordingMbid && !opts.recordingMsid) {
    throw new Error("submitPin requires recordingMbid or recordingMsid");
  }
  const body: Record<string, unknown> = {};
  if (opts.recordingMbid) body.recording_mbid = opts.recordingMbid;
  if (opts.recordingMsid) body.recording_msid = opts.recordingMsid;
  if (opts.blurb !== undefined) body.blurb_content = opts.blurb;
  if (opts.pinnedUntil !== undefined) body.pinned_until = opts.pinnedUntil;
  await lbPost("/pin", token, body);
}

// ─── Recommend personally to followers ──────────────────────────────

export interface SubmitRecommendationOptions {
  recordingMbid: string;
  recipients: string[];
  blurb?: string;
}

/**
 * Send a personal recommendation to one or more LB users (typically
 * followers). LB nests the payload under `metadata` — the bare-fields
 * shape used by other write endpoints fails validation here.
 */
export async function submitRecommendation(
  token: string,
  opts: SubmitRecommendationOptions,
): Promise<void> {
  const metadata: Record<string, unknown> = {
    recording_mbid: opts.recordingMbid,
    users: opts.recipients,
  };
  if (opts.blurb !== undefined) metadata.blurb_content = opts.blurb;
  await lbPost("/recommend-personal-recording", token, { metadata });
}

// ─── Thanks (acknowledge a pin / rec / personal-rec) ────────────────

/**
 * Thank another user for a timeline event they posted (a pin, a public
 * recording_recommendation, or a personal recording recommendation
 * received). LB requires the thanker to be following the thankee
 * (returns 401 otherwise) — we don't pre-check; the caller surfaces
 * the error if it happens.
 *
 * `originalEventId` semantics depend on the event type, per LB:
 *   - recording_pin                       → pin's row_id
 *   - recording_recommendation            → timeline event id
 *   - personal_recording_recommendation   → timeline event id
 *
 * Other event types are not thankable on the LB side.
 */
export async function submitThanks(
  thanker: string,
  token: string,
  opts: {
    originalEventType:
      | "recording_pin"
      | "recording_recommendation"
      | "personal_recording_recommendation";
    originalEventId: number;
    blurb?: string;
  },
): Promise<void> {
  const metadata: Record<string, unknown> = {
    original_event_type: opts.originalEventType,
    original_event_id: opts.originalEventId,
  };
  if (opts.blurb !== undefined) metadata.blurb_content = opts.blurb;
  await lbPost(
    `/user/${encodeURIComponent(thanker)}/timeline-event/create/thanks`,
    token,
    { metadata },
  );
}

// ─── Add to existing playlist ───────────────────────────────────────

/**
 * Append a recording to the end of an existing LB playlist. Body uses
 * the JSPF track shape — `identifier` is a string-array (matches the
 * shape LB returns from `getPlaylist`'s tracks). Caller must own the
 * playlist or be a collaborator.
 */
export async function addRecordingToPlaylist(
  token: string,
  playlistMbid: string,
  recordingMbid: string,
): Promise<void> {
  await lbPost(
    `/playlist/${encodeURIComponent(playlistMbid)}/item/add`,
    token,
    {
      playlist: {
        track: [
          {
            identifier: [
              `https://musicbrainz.org/recording/${recordingMbid}`,
            ],
          },
        ],
      },
    },
  );
}

// ─── Create a playlist on LB ────────────────────────────────────────

export interface CreatePlaylistOptions {
  name: string;
  isPublic: boolean;
  /** Optional first track to seed the new playlist with. */
  recordingMbid?: string;
}

const CreatePlaylistResponseSchema = z.object({
  status: z.string().optional(),
  playlist_mbid: z.string(),
});

/**
 * Create a new playlist. Returns the LB-assigned playlist MBID so the
 * caller can navigate / reference it immediately. When `recordingMbid`
 * is set the playlist is created with that single track — saves a
 * second round-trip vs. create-then-add.
 */
export async function createPlaylistOnLb(
  token: string,
  opts: CreatePlaylistOptions,
): Promise<{ playlistMbid: string }> {
  const playlist: Record<string, unknown> = {
    title: opts.name,
    extension: {
      "https://musicbrainz.org/doc/jspf#playlist": { public: opts.isPublic },
    },
  };
  if (opts.recordingMbid) {
    playlist.track = [
      {
        identifier: [
          `https://musicbrainz.org/recording/${opts.recordingMbid}`,
        ],
      },
    ];
  }
  const res = await fetchWithTimeout(`${LB_BASE}/playlist/create`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: JSON.stringify({ playlist }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ListenBrainzError(
      res.status,
      `LB ${res.status} on /playlist/create: ${text.slice(0, 300)}`,
    );
  }
  const json = await res.json();
  const parsed = CreatePlaylistResponseSchema.parse(json);
  return { playlistMbid: parsed.playlist_mbid };
}

// ─── Delete a listen ────────────────────────────────────────────────

/**
 * Remove a single listen from the user's history. LB keys deletes by
 * `(recording_msid, listened_at)` — the row's MBID isn't enough since
 * the same recording can have many listens. Caller must own the listen.
 */
export async function deleteListen(
  token: string,
  recordingMsid: string,
  listenedAt: number,
): Promise<void> {
  await lbPost("/delete-listen", token, {
    recording_msid: recordingMsid,
    listened_at: listenedAt,
  });
}

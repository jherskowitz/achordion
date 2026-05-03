import "server-only";

import { z } from "zod";

const LB_BASE = "https://api.listenbrainz.org/1";
const LB_LABS_BASE = "https://labs.api.listenbrainz.org";
const USER_AGENT =
  "Achordion/0.1 (+https://github.com/jherskowitz/achordion)";

class ListenBrainzError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
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
}

async function lbFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  opts: FetchOptions = {},
): Promise<T> {
  const url = `${LB_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: opts.noStore ? "no-store" : undefined,
    next: opts.noStore
      ? undefined
      : {
          revalidate: opts.revalidate ?? 60,
          tags: opts.tags,
        },
  });

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
        origin_url: z.string().optional(),
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
  return result.payload.listens;
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
    return result.payload.listens[0] ?? null;
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
): Promise<UserPlaylistsPage> {
  try {
    const params = new URLSearchParams({
      count: String(count),
      offset: String(offset),
    });
    const result = await lbFetch(
      `/user/${encodeURIComponent(name)}/playlists?${params}`,
      UserPlaylistsResponseSchema,
      {
        revalidate: 60 * 5,
        tags: [`lb:user:${name}:playlists`],
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
        const res = await fetch(url, {
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
  const res = await fetch(
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
    const res = await fetch(`${LB_BASE}/popularity/${kind}`, {
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
    const res = await fetch(url, {
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
    const res = await fetch(`${LB_BASE}/explore/lb-radio?${params}`, {
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

export async function getPlaylist(mbid: string): Promise<PlaylistDetail | null> {
  try {
    const result = await lbFetch(
      `/playlist/${encodeURIComponent(mbid)}`,
      PlaylistDetailResponseSchema,
      { revalidate: 60 * 5, tags: [`lb:playlist:${mbid}`] },
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
 * Edit a playlist's visibility.
 *
 * LB exposes `POST /1/playlist/edit/{mbid}` accepting a partial JSPF
 * body. The handler reads `extension["jspf#playlist"].public` (and a
 * few other fields) and applies whichever are present. There's a
 * known sharp edge: the `collaborators` field is rebuilt from
 * whatever the body contains — sending an extension object without
 * `collaborators` can clear them. To stay safe we re-send the
 * existing collaborators list alongside the flipped `public` flag.
 *
 * Returns `{ ok: true }` on 200, `{ ok: false, status, message }`
 * otherwise. 403 = not the owner; 401 = bad/missing token.
 *
 * Source: github.com/metabrainz/listenbrainz-server  →
 *   listenbrainz/webserver/views/playlist_api.py::edit_playlist
 */
export async function setPlaylistVisibility(
  mbid: string,
  isPublic: boolean,
  collaborators: string[],
  token: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const body = {
    playlist: {
      extension: {
        "https://musicbrainz.org/doc/jspf#playlist": {
          public: isPublic,
          collaborators,
        },
      },
    },
  };
  const res = await fetch(
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
    const res = await fetch(`${LB_LABS_BASE}/similar-artists/json`, {
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

// ─── User feed (events) ─────────────────────────────────────────────

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
    const res = await fetch(
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

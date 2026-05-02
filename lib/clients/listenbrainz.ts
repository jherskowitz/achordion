import "server-only";

import { z } from "zod";

const LB_BASE = "https://api.listenbrainz.org/1";
const LB_LABS_BASE = "https://labs.api.listenbrainz.org";
const USER_AGENT = "Achordion/0.1 (+https://github.com/jherskow/achordion)";

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
};

interface FetchOptions {
  /** Seconds — default 60. Pass 0 to disable caching. */
  revalidate?: number;
  tags?: string[];
}

async function lbFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  opts: FetchOptions = {},
): Promise<T> {
  const url = `${LB_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: {
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
  opts: { count?: number; minTs?: number; maxTs?: number } = {},
): Promise<Listen[]> {
  const params = new URLSearchParams();
  if (opts.count) params.set("count", String(opts.count));
  if (opts.minTs) params.set("min_ts", String(opts.minTs));
  if (opts.maxTs) params.set("max_ts", String(opts.maxTs));
  const qs = params.toString();
  const path = `/user/${encodeURIComponent(userName)}/listens${qs ? `?${qs}` : ""}`;

  const result = await lbFetch(path, ListensResponseSchema, {
    revalidate: 60,
    tags: [cacheTagsLB.userListens(userName), cacheTagsLB.user(userName)],
  });
  return result.payload.listens;
}

const PlayingNowResponseSchema = z.object({
  payload: z.object({
    count: z.number(),
    user_id: z.string().optional(),
    listens: z.array(ListenSchema),
    playing_now: z.boolean().optional(),
  }),
});

export async function getPlayingNow(userName: string): Promise<Listen | null> {
  try {
    const result = await lbFetch(
      `/user/${encodeURIComponent(userName)}/playing-now`,
      PlayingNowResponseSchema,
      { revalidate: 30, tags: [cacheTagsLB.user(userName)] },
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

export async function followUser(
  target: string,
  token: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `${LB_BASE}/user/${encodeURIComponent(target)}/follow`,
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
  return { ok: res.ok, status: res.status };
}

export async function unfollowUser(
  target: string,
  token: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `${LB_BASE}/user/${encodeURIComponent(target)}/follow`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Token ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  return { ok: res.ok, status: res.status };
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

function extractMbid(url: string | undefined | null, kind: "artist" | "recording" | "release"): string | null {
  if (!url) return null;
  const m = url.match(new RegExp(`/${kind}/([0-9a-f-]{36})`));
  return m?.[1] ?? null;
}

export async function getLbRadio(
  prompt: string,
  mode: "easy" | "medium" | "hard" = "easy",
): Promise<LbRadioTrack[] | null> {
  const { getLbTokenForRequest } = await import("@/lib/lb-token");
  const token = await getLbTokenForRequest();
  if (!token) return null;

  const params = new URLSearchParams({ prompt, mode });
  try {
    const res = await fetch(`${LB_BASE}/explore/lb-radio?${params}`, {
      headers: {
        Authorization: `Token ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      next: {
        revalidate: 60 * 60,
        tags: [`lb:radio:${prompt}:${mode}`],
      },
    });
    if (!res.ok) return null;
    const data = LbRadioResponseSchema.parse(await res.json());
    const tracks = data.payload.jspf.playlist.track ?? [];
    return tracks.map((t) => {
      const ext = t.extension?.["https://musicbrainz.org/doc/jspf#track"];
      const idArr = Array.isArray(t.identifier)
        ? t.identifier
        : t.identifier
          ? [t.identifier]
          : [];
      return {
        title: t.title,
        artistName: t.creator ?? "",
        artistMbid: extractMbid(ext?.artist_identifiers?.[0], "artist"),
        recordingMbid: extractMbid(idArr[0], "recording"),
        releaseMbid: extractMbid(ext?.release_identifier, "release"),
        releaseName: t.album ?? null,
        durationMs: t.duration ?? null,
        caaId: ext?.additional_metadata?.caa_id ?? null,
        caaReleaseMbid: ext?.additional_metadata?.caa_release_mbid ?? null,
      };
    });
  } catch {
    return null;
  }
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

import "server-only";

import { z } from "zod";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

const MIN_INTERVAL_MS = 1000;

// Hard ceiling on a single MB HTTP round-trip. MB normally answers
// sub-second to ~2s; when it degrades it can sit on a connection for
// 40s+ (observed in prod). Without an abort, a slow MB response keeps
// the serverless function alive until Vercel's execution limit kills
// it with a 504 — and a 504 means the calling route's try/catch
// fallback (e.g. lookup routes' graceful 302 to /search) never runs,
// because a hung request never throws. Aborting at 8s converts that
// silent hang into a thrown TimeoutError the callers already handle,
// well under the function limit and far above MB's healthy latency.
const MB_FETCH_TIMEOUT_MS = 8000;

class MusicBrainzError extends Error {
  // Next.js preserves `digest` across the server→client error boundary
  // even in production (where the message is sanitized), so we tag
  // 429s with a known string and let `app/(app)/error.tsx` show
  // a rate-limit-specific page instead of the generic fallback.
  digest?: string;
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    if (status === 429) {
      this.digest = "MB_RATE_LIMITED";
    }
  }
}

// In-process token bucket only — 1 req/sec per Vercel instance.
//
// Earlier this also fronted an Upstash-backed sliding-window
// limiter to share the bucket across instances. Each
// `blockUntilReady` poll cost ~3-4 Redis ops, and on a busy queue
// it'd poll repeatedly per blocked call — that path was
// responsible for the bulk of our Upstash command consumption.
//
// Without cross-instance coordination, N concurrent Vercel
// instances can theoretically blast N req/sec at MB and trip
// their ~1 req/sec cap. In practice:
//   - Most requests serve from CDN / Next data cache, never
//     reaching this code.
//   - Vercel's serverless model coalesces concurrent invocations
//     onto few warm instances; cross-instance contention is
//     short-lived.
//   - MB has been generous in production logs.
//
// If we start seeing MB 429s under load (watch the
// MusicBrainzError digest "MB_RATE_LIMITED" surface in the
// in-app error page), opt back into Upstash here.
const localQueue = (() => {
  let lastCallAt = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return async function schedule<T>(fn: () => Promise<T>): Promise<T> {
    chain = chain.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - now);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      lastCallAt = Date.now();
    });
    await chain;
    return fn();
  };
})();

async function queue<T>(fn: () => Promise<T>): Promise<T> {
  return localQueue(fn);
}

export const cacheTagsMB = {
  artist: (mbid: string) => `mb:artist:${mbid}`,
  releaseGroup: (mbid: string) => `mb:release-group:${mbid}`,
  release: (mbid: string) => `mb:release:${mbid}`,
  recording: (mbid: string) => `mb:recording:${mbid}`,
  search: (q: string) => `mb:search:${q}`,
};

interface FetchOptions {
  revalidate?: number;
  tags?: string[];
}

async function mbFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  opts: FetchOptions = {},
): Promise<T> {
  return queue(async () => {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${MB_BASE}${path}${sep}fmt=json`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(MB_FETCH_TIMEOUT_MS),
        next: {
          revalidate: opts.revalidate ?? 60 * 60 * 24,
          tags: opts.tags,
        },
      });
    } catch (e) {
      // AbortSignal.timeout fires a TimeoutError DOMException; network
      // failures throw TypeError. Normalize both into a MusicBrainzError
      // so callers get the consistent `digest` and we never let a raw
      // hang/abort escape as an unhandled 504. 504 here is "we gave up
      // on MB", not "we crashed".
      const aborted =
        e instanceof DOMException && e.name === "TimeoutError";
      throw new MusicBrainzError(
        504,
        aborted
          ? `MB timeout after ${MB_FETCH_TIMEOUT_MS}ms: ${path}`
          : `MB fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MusicBrainzError(res.status, `MB ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    return schema.parse(json);
  });
}

const AreaSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    "sort-name": z.string().optional(),
    "iso-3166-1-codes": z.array(z.string()).optional(),
  })
  .partial()
  .passthrough();

const ArtistRelationSchema = z
  .object({
    type: z.string(),
    direction: z.enum(["forward", "backward"]).optional(),
    begin: z.string().nullish(),
    end: z.string().nullish(),
    ended: z.boolean().nullish(),
    attributes: z.array(z.string()).optional(),
    artist: z
      .object({
        id: z.string(),
        name: z.string(),
        "sort-name": z.string().optional(),
        disambiguation: z.string().optional(),
      })
      .partial()
      .passthrough(),
  })
  .passthrough();

const UrlRelationSchema = z
  .object({
    type: z.string(),
    url: z.object({ resource: z.string() }).passthrough(),
  })
  .passthrough();

const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  "sort-name": z.string().optional(),
  type: z.string().nullish(),
  country: z.string().nullish(),
  area: AreaSchema.nullish(),
  "begin-area": AreaSchema.nullish(),
  "life-span": z
    .object({
      begin: z.string().nullish(),
      end: z.string().nullish(),
      ended: z.boolean().nullish(),
    })
    .partial()
    .nullish(),
  disambiguation: z.string().nullish(),
  tags: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional(),
  genres: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional(),
  aliases: z
    .array(
      z
        .object({
          name: z.string(),
          locale: z.string().nullish(),
          primary: z.boolean().nullish(),
          type: z.string().nullish(),
        })
        .passthrough(),
    )
    .optional(),
  rating: z
    .object({
      value: z.number().nullish(),
      "votes-count": z.number().optional(),
    })
    .partial()
    .nullish(),
});

export type Artist = z.infer<typeof ArtistSchema>;

const ArtistDetailSchema = ArtistSchema.extend({
  relations: z.array(z.union([ArtistRelationSchema, UrlRelationSchema])).optional(),
});

export type ArtistDetail = z.infer<typeof ArtistDetailSchema>;

export type ArtistMember = {
  artist: { id: string; name: string };
  attributes?: string[];
  begin?: string | null;
  end?: string | null;
  ended?: boolean | null;
};

export type ArtistExternalLink = {
  type: string;
  url: string;
};

/**
 * MB returns the same `relations` shape on artists, release-groups, and
 * other entities — accept any input with that field rather than tying
 * the helper to ArtistDetail. Zod's union of two passthrough schemas
 * widens member fields to `unknown` after a `"x" in y` narrow, so we
 * cast the matched URL relation to its concrete shape (the runtime
 * `"url" in rel` check makes this safe).
 */
type MbRelation = NonNullable<ArtistDetail["relations"]>[number];
type MbUrlRelation = z.infer<typeof UrlRelationSchema>;

export function partitionArtistRelations(detail: {
  relations?: MbRelation[];
}): {
  members: ArtistMember[];
  memberOf: ArtistMember[];
  collaborators: ArtistMember[];
  urls: ArtistExternalLink[];
} {
  const members: ArtistMember[] = [];
  const memberOf: ArtistMember[] = [];
  const collaborators: ArtistMember[] = [];
  const urls: ArtistExternalLink[] = [];

  for (const rel of detail.relations ?? []) {
    if ("url" in rel) {
      const urlRel = rel as MbUrlRelation;
      urls.push({ type: urlRel.type, url: urlRel.url.resource });
      continue;
    }
    if (!("artist" in rel) || !rel.artist?.id || !rel.artist?.name) continue;
    const entry: ArtistMember = {
      artist: { id: rel.artist.id, name: rel.artist.name },
      attributes: rel.attributes,
      begin: rel.begin,
      end: rel.end,
      ended: rel.ended,
    };
    if (rel.type === "member of band") {
      // backward = "X is a member of this artist" → bandmember of THIS group
      // forward = "this artist is a member of X" → THIS artist's parent groups
      if (rel.direction === "backward") members.push(entry);
      else memberOf.push(entry);
    } else if (rel.type === "collaboration") {
      collaborators.push(entry);
    }
  }

  return { members, memberOf, collaborators, urls };
}

export async function getArtist(mbid: string): Promise<ArtistDetail> {
  return mbFetch(
    `/artist/${encodeURIComponent(mbid)}?inc=tags+genres+aliases+ratings+artist-rels+url-rels`,
    ArtistDetailSchema,
    { tags: [cacheTagsMB.artist(mbid)] },
  );
}

const ArtistCreditSchema = z.array(
  z
    .object({
      name: z.string(),
      joinphrase: z.string().optional(),
      artist: z
        .object({
          id: z.string(),
          name: z.string(),
          "sort-name": z.string().optional(),
          disambiguation: z.string().optional(),
        })
        .partial()
        .passthrough(),
    })
    .passthrough(),
);

const ReleaseStubSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string().nullish(),
    date: z.string().nullish(),
    country: z.string().nullish(),
    "track-count": z.number().nullish(),
    disambiguation: z.string().nullish(),
    "release-events": z
      .array(
        z
          .object({
            date: z.string().nullish(),
            area: z
              .object({
                name: z.string(),
                "iso-3166-1-codes": z.array(z.string()).optional(),
              })
              .partial()
              .passthrough()
              .nullish(),
          })
          .partial()
          .passthrough(),
      )
      .optional(),
    media: z
      .array(
        z
          .object({
            format: z.string().nullish(),
            "track-count": z.number().nullish(),
          })
          .partial()
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const ReleaseGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  "primary-type": z.string().nullish(),
  "secondary-types": z.array(z.string()).optional(),
  "first-release-date": z.string().nullish(),
  disambiguation: z.string().nullish(),
});

export type ReleaseGroup = z.infer<typeof ReleaseGroupSchema>;

const ReleaseGroupDetailSchema = ReleaseGroupSchema.extend({
  "artist-credit": ArtistCreditSchema.optional(),
  releases: z.array(ReleaseStubSchema).optional(),
  tags: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional(),
  genres: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional(),
  relations: z.array(z.union([ArtistRelationSchema, UrlRelationSchema])).optional(),
});

export type ReleaseGroupDetail = z.infer<typeof ReleaseGroupDetailSchema>;
export type ReleaseStub = z.infer<typeof ReleaseStubSchema>;

export async function getReleaseGroup(mbid: string): Promise<ReleaseGroupDetail> {
  return mbFetch(
    `/release-group/${encodeURIComponent(mbid)}?inc=artist-credits+releases+tags+genres+url-rels+ratings`,
    ReleaseGroupDetailSchema,
    { tags: [cacheTagsMB.releaseGroup(mbid)] },
  );
}

const TrackSchema = z
  .object({
    id: z.string(),
    number: z.string().optional(),
    position: z.number().optional(),
    title: z.string(),
    length: z.number().nullish(),
    "artist-credit": ArtistCreditSchema.optional(),
    recording: z
      .object({
        id: z.string(),
        title: z.string(),
        length: z.number().nullish(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

const MediumSchema = z
  .object({
    format: z.string().nullish(),
    title: z.string().optional(),
    position: z.number().optional(),
    "track-count": z.number().nullish(),
    tracks: z.array(TrackSchema).optional(),
  })
  .passthrough();

const ReleaseDetailSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string().nullish(),
    date: z.string().nullish(),
    country: z.string().nullish(),
    "release-group": ReleaseGroupSchema.nullish(),
    "artist-credit": ArtistCreditSchema.optional(),
    media: z.array(MediumSchema).optional(),
    // Streaming / purchase / review url-rels — release-level URLs are
    // often denser than release-group-level ones (e.g. Spotify and
    // Apple Music are usually attached to a specific edition rather
    // than the abstract release group). The album page merges these
    // with the rg-level rels for the favicon row.
    relations: z
      .array(z.union([ArtistRelationSchema, UrlRelationSchema]))
      .optional(),
  })
  .passthrough();

export type ReleaseDetail = z.infer<typeof ReleaseDetailSchema>;
export type Track = z.infer<typeof TrackSchema>;

export async function getRelease(mbid: string): Promise<ReleaseDetail> {
  return mbFetch(
    `/release/${encodeURIComponent(mbid)}?inc=recordings+artist-credits+release-groups+url-rels`,
    ReleaseDetailSchema,
    { tags: [cacheTagsMB.release(mbid)] },
  );
}

// MB recording: a single performance — distinct from a Track (which is a
// recording placed on a specific medium of a specific release). A
// recording can appear on many releases / release-groups.

const RecordingReleaseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string().nullish(),
    date: z.string().nullish(),
    "release-group": ReleaseGroupSchema.nullish(),
    "artist-credit": ArtistCreditSchema.optional(),
  })
  .passthrough();

const RecordingDetailSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    /** Length in milliseconds; null on incomplete entries. */
    length: z.number().nullish(),
    disambiguation: z.string().nullish(),
    "first-release-date": z.string().nullish(),
    isrcs: z.array(z.string()).optional(),
    "artist-credit": ArtistCreditSchema.optional(),
    releases: z.array(RecordingReleaseSchema).optional(),
    relations: z
      .array(z.union([ArtistRelationSchema, UrlRelationSchema]))
      .optional(),
    tags: z
      .array(z.object({ name: z.string(), count: z.number() }))
      .optional(),
    genres: z
      .array(z.object({ name: z.string(), count: z.number() }))
      .optional(),
    rating: z
      .object({
        value: z.number().nullish(),
        "votes-count": z.number().optional(),
      })
      .partial()
      .nullish(),
  })
  .passthrough();

export type RecordingDetail = z.infer<typeof RecordingDetailSchema>;
export type RecordingRelease = z.infer<typeof RecordingReleaseSchema>;

export async function getRecording(mbid: string): Promise<RecordingDetail> {
  return mbFetch(
    `/recording/${encodeURIComponent(mbid)}?inc=artist-credits+releases+release-groups+tags+genres+url-rels+isrcs+ratings`,
    RecordingDetailSchema,
    { tags: [cacheTagsMB.recording(mbid)] },
  );
}

/**
 * Reduce a recording's `releases` array to one entry per
 * release-group, preferring the earliest official release inside each
 * group. Used by the recording page to render an "Appears on" list of
 * canonical albums rather than a flood of CD/vinyl/region variants.
 */
export function dedupeReleaseGroups(
  releases: RecordingRelease[] | undefined,
): RecordingRelease[] {
  if (!releases || releases.length === 0) return [];
  const byGroup = new Map<string, RecordingRelease>();
  for (const r of releases) {
    const rgId = r["release-group"]?.id;
    if (!rgId) continue;
    const existing = byGroup.get(rgId);
    if (!existing) {
      byGroup.set(rgId, r);
      continue;
    }
    // Prefer Official over other statuses, then earlier dates.
    const isBetter =
      (r.status === "Official" && existing.status !== "Official") ||
      (r.status === existing.status &&
        (r.date ?? "9999") < (existing.date ?? "9999"));
    if (isBetter) byGroup.set(rgId, r);
  }
  return [...byGroup.values()].sort((a, b) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999"),
  );
}

/**
 * Pick the most representative release from a release group:
 * 1. Status = "Official" preferred
 * 2. Earliest date (typically the original release)
 * 3. Fall back to the first release if none qualify
 */
export function pickCanonicalRelease(
  rg: ReleaseGroupDetail,
): ReleaseStub | null {
  const releases = rg.releases ?? [];
  if (releases.length === 0) return null;
  const official = releases.filter((r) => r.status === "Official");
  const pool = official.length > 0 ? official : releases;
  // Prefer the XW (worldwide) edition over any country-specific one.
  // MB editors conventionally attach streaming-service url-rels
  // (Spotify / Apple / Deezer / etc.) to the XW release because those
  // links apply globally. After that, fall back to earliest date.
  return pool.slice().sort((a, b) => {
    const ax = a.country === "XW" ? 0 : 1;
    const bx = b.country === "XW" ? 0 : 1;
    if (ax !== bx) return ax - bx;
    return (a.date ?? "9999").localeCompare(b.date ?? "9999");
  })[0];
}

export function formatArtistCredit(
  credit: z.infer<typeof ArtistCreditSchema> | undefined,
): { name: string; primaryArtistId: string | null; parts: Array<{ name: string; id: string | null; join: string }> } {
  if (!credit || credit.length === 0) {
    return { name: "Unknown", primaryArtistId: null, parts: [] };
  }
  const parts = credit.map((c) => ({
    name: c.name,
    id: c.artist?.id ?? null,
    join: c.joinphrase ?? "",
  }));
  const name = parts.map((p) => p.name + p.join).join("");
  return { name, primaryArtistId: parts[0]?.id ?? null, parts };
}

const ArtistReleaseGroupsSchema = z.object({
  "release-group-count": z.number().optional(),
  "release-groups": z.array(ReleaseGroupSchema),
});

/**
 * Fetch ALL release groups for an artist by paging through MB's browse endpoint.
 * Caps out at 500 to avoid pathological cases (very prolific artists).
 */
export async function getArtistReleaseGroups(
  mbid: string,
): Promise<ReleaseGroup[]> {
  const PAGE = 100;
  // Cap at 200 release groups (2 paginated MB calls). Even prolific
  // artists like Bob Dylan top out around 100-150 release groups
  // before deep cuts (compilations, video releases, foreign-edition
  // re-issues) take over — and those tend to bucket as Compilation /
  // Other anyway. Going from 500 → 200 saves up to 3 MB calls per
  // artist render at the 1-req/sec MB rate limit, which is the
  // dominant CPU cost on Vercel for cold artist pages.
  const MAX = 200;
  const all: ReleaseGroup[] = [];
  // MB sometimes returns the same release-group across pagination
  // boundaries when the underlying ordering shifts mid-fetch — dedupe
  // by MBID so React doesn't choke on duplicate keys.
  const seen = new Set<string>();
  let offset = 0;
  while (offset < MAX) {
    const params = new URLSearchParams({
      artist: mbid,
      limit: String(PAGE),
      offset: String(offset),
    });
    const result = await mbFetch(
      `/release-group?${params}`,
      ArtistReleaseGroupsSchema,
      {
        revalidate: 60 * 60 * 24,
        tags: [cacheTagsMB.artist(mbid), `mb:artist:${mbid}:rgs`],
      },
    );
    for (const rg of result["release-groups"]) {
      if (seen.has(rg.id)) continue;
      seen.add(rg.id);
      all.push(rg);
    }
    if (result["release-groups"].length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export type DiscographyBucket = {
  type: string;
  releaseGroups: ReleaseGroup[];
};

const STUDIO_TYPES = ["Album", "EP", "Single"] as const;
type StudioType = (typeof STUDIO_TYPES)[number];

/**
 * Bucket an artist's release groups into Albums / EPs / Singles.
 * Studio releases only — anything tagged as a Compilation, Live, Remix,
 * Soundtrack, Demo, Mixtape/Street, Audio drama, or Spokenword secondary
 * type is filtered out.
 */
export function bucketDiscography(
  groups: ReleaseGroup[],
): DiscographyBucket[] {
  const NON_STUDIO_SECONDARY = new Set([
    "Compilation",
    "Live",
    "Remix",
    "Soundtrack",
    "Demo",
    "Mixtape/Street",
    "Audio drama",
    "Spokenword",
    "Interview",
    "DJ-mix",
  ]);
  const studio = groups.filter((g) => {
    const primary = g["primary-type"];
    if (!primary || !STUDIO_TYPES.includes(primary as StudioType)) return false;
    return !(g["secondary-types"] ?? []).some((s) =>
      NON_STUDIO_SECONDARY.has(s),
    );
  });

  const byType = new Map<StudioType, ReleaseGroup[]>();
  for (const g of studio) {
    const primary = g["primary-type"] as StudioType;
    if (!byType.has(primary)) byType.set(primary, []);
    byType.get(primary)!.push(g);
  }

  for (const items of byType.values()) {
    items.sort((a, b) => {
      const da = a["first-release-date"] ?? "";
      const db = b["first-release-date"] ?? "";
      return db.localeCompare(da);
    });
  }

  return STUDIO_TYPES.filter((t) => byType.has(t)).map((type) => ({
    type,
    releaseGroups: byType.get(type)!,
  }));
}

const ArtistSearchSchema = z.object({
  artists: z.array(ArtistSchema.extend({ score: z.number().optional() })),
  count: z.number().optional(),
});

/**
 * Lower-case + trim + collapse internal whitespace. Applied to the
 * search-query string before it becomes part of the path that `mbFetch`
 * uses as its cache key. MB Lucene queries are already case-insensitive
 * server-side, so two queries that differ only in case or whitespace
 * return the same data — without this normalization they each hash to
 * a distinct cache entry, fragmenting the cache and giving an attacker
 * a cheap way to inflate it. Pure cosmetic correctness, not a security
 * fix on its own, but it removes a minor abuse vector.
 */
function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function searchArtists(query: string, limit = 8) {
  const q = normalizeSearchQuery(query);
  if (!q) return [];
  const params = new URLSearchParams({ query: q, limit: String(limit) });
  const result = await mbFetch(
    `/artist?${params}`,
    ArtistSearchSchema,
    { revalidate: 60 * 60, tags: [cacheTagsMB.search(q)] },
  );
  return result.artists;
}

const ReleaseGroupSearchSchema = z.object({
  "release-groups": z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      "primary-type": z.string().nullish(),
      "first-release-date": z.string().nullish(),
      "artist-credit": z
        .array(
          z.object({
            name: z.string(),
            joinphrase: z.string().optional(),
            artist: z.object({ id: z.string(), name: z.string() }),
          }),
        )
        .optional(),
      score: z.number().optional(),
    }),
  ),
});

export async function searchReleaseGroups(query: string, limit = 8) {
  const q = normalizeSearchQuery(query);
  if (!q) return [];
  const params = new URLSearchParams({ query: q, limit: String(limit) });
  const result = await mbFetch(
    `/release-group?${params}`,
    ReleaseGroupSearchSchema,
    { revalidate: 60 * 60 },
  );
  return result["release-groups"];
}

const RecordingSearchSchema = z.object({
  recordings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      length: z.number().nullish(),
      "artist-credit": z
        .array(
          z.object({
            name: z.string(),
            joinphrase: z.string().optional(),
            artist: z.object({ id: z.string(), name: z.string() }),
          }),
        )
        .optional(),
      score: z.number().optional(),
    }),
  ),
});

/**
 * MB recording search — used by `/recording/lookup` to resolve a
 * (artist, title) pair to a recording MBID at click time.
 */
export async function searchRecordings(query: string, limit = 8) {
  const q = normalizeSearchQuery(query);
  if (!q) return [];
  const params = new URLSearchParams({ query: q, limit: String(limit) });
  const result = await mbFetch(`/recording?${params}`, RecordingSearchSchema, {
    revalidate: 60 * 60,
  });
  return result.recordings;
}

// ─── Tag-based discovery ────────────────────────────────────────────

function quoteTag(tag: string): string {
  // Escape internal quotes and wrap in quotes — MB lucene needs this for
  // multi-word tags like "hip hop" or "synth pop".
  return `"${tag.replace(/"/g, '\\"')}"`;
}

export async function getArtistsByTag(tag: string, limit = 24) {
  if (!tag.trim()) return [];
  const params = new URLSearchParams({
    query: `tag:${quoteTag(tag)}`,
    limit: String(limit),
  });
  const result = await mbFetch(
    `/artist?${params}`,
    ArtistSearchSchema,
    {
      revalidate: 60 * 60 * 24,
      tags: [`mb:tag:${tag.toLowerCase()}:artists`],
    },
  );
  return result.artists;
}

export async function getReleaseGroupsByTag(
  tag: string,
  limit = 24,
  offset = 0,
) {
  if (!tag.trim()) return [];
  const params = new URLSearchParams({
    query: `tag:${quoteTag(tag)} AND primarytype:Album`,
    limit: String(limit),
  });
  if (offset > 0) params.set("offset", String(offset));
  const result = await mbFetch(
    `/release-group?${params}`,
    ReleaseGroupSearchSchema,
    {
      revalidate: 60 * 60 * 24,
      tags: [`mb:tag:${tag.toLowerCase()}:release-groups${offset ? `:${offset}` : ""}`],
    },
  );
  return result["release-groups"];
}

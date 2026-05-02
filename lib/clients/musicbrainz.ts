import "server-only";

import { z } from "zod";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

const MIN_INTERVAL_MS = 1000;

class MusicBrainzError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const queue = (() => {
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
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: opts.revalidate ?? 60 * 60 * 24,
        tags: opts.tags,
      },
    });
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

export function partitionArtistRelations(detail: ArtistDetail): {
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
      urls.push({ type: rel.type, url: rel.url.resource });
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

const ReleaseGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  "primary-type": z.string().nullish(),
  "secondary-types": z.array(z.string()).optional(),
  "first-release-date": z.string().nullish(),
  disambiguation: z.string().nullish(),
});

export type ReleaseGroup = z.infer<typeof ReleaseGroupSchema>;

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
  const MAX = 500;
  const all: ReleaseGroup[] = [];
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
    all.push(...result["release-groups"]);
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

export async function searchArtists(query: string, limit = 8) {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ query, limit: String(limit) });
  const result = await mbFetch(
    `/artist?${params}`,
    ArtistSearchSchema,
    { revalidate: 60 * 60, tags: [cacheTagsMB.search(query)] },
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
            artist: z.object({ id: z.string(), name: z.string() }),
          }),
        )
        .optional(),
      score: z.number().optional(),
    }),
  ),
});

export async function searchReleaseGroups(query: string, limit = 8) {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ query, limit: String(limit) });
  const result = await mbFetch(
    `/release-group?${params}`,
    ReleaseGroupSearchSchema,
    { revalidate: 60 * 60 },
  );
  return result["release-groups"];
}

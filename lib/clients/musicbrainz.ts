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

const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  "sort-name": z.string().optional(),
  type: z.string().nullish(),
  country: z.string().nullish(),
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
});

export type Artist = z.infer<typeof ArtistSchema>;

export async function getArtist(mbid: string): Promise<Artist> {
  return mbFetch(
    `/artist/${encodeURIComponent(mbid)}?inc=tags`,
    ArtistSchema,
    { tags: [cacheTagsMB.artist(mbid)] },
  );
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

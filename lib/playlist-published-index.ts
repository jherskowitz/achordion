import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Playlist-published event index.
 *
 * Records when a user flips a playlist from private → public. LB's
 * timeline doesn't emit anything for this transition, so we mint a
 * synthetic feed event Achordion-side and fan it out to the owner's
 * followers via `lib/playlist-events.ts`.
 *
 * Storage shape mirrors `lib/mention-index.ts` and
 * `lib/listen-along-index.ts`:
 *   - One sorted set per owner: `playlist:published:<owner>`
 *   - Member: JSON-serialised event payload
 *   - Score: created unix seconds
 *   - Capped at MAX_PER_USER, TTL'd to 90 days
 *
 * Dedupe: the (mbid, owner) pair is the natural identity. If the
 * same playlist is re-flipped (private → public → private → public)
 * within DEDUPE_WINDOW_SECONDS, we collapse to the latest event so
 * a flip-flopping owner doesn't spam follower feeds.
 */

const MAX_PER_USER = 200;
const TTL_SECONDS = 60 * 60 * 24 * 90;
/** Two publish events on the same playlist from the same owner
 *  within this window collapse to the latest one. Sized to absorb
 *  honest correction flips (e.g. immediately re-flip after a typo
 *  in the title — owner wants to fix-then-publish) without spamming
 *  the feed with duplicates. */
const DEDUPE_WINDOW_SECONDS = 10 * 60;

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function key(owner: string): string {
  return `playlist:published:${owner.toLowerCase()}`;
}

export interface PlaylistPublishedEvent {
  /** LB playlist MBID. */
  mbid: string;
  /** Owner's LB username. */
  owner: string;
  /** Playlist title at publish time. Stored so the renderer doesn't
   *  have to refetch when only displaying the headline; the link
   *  always resolves to the current `/playlist/<mbid>`. */
  title: string;
  /** Unix seconds — when the publish was recorded. */
  created: number;
}

/**
 * Record one playlist-published event. Dedupes against any prior
 * entry for the same playlist mbid within DEDUPE_WINDOW_SECONDS —
 * the later entry overwrites (so flip-fix-flip keeps the most
 * recent title + timestamp).
 *
 * Returns `true` when a new event was written, `false` when deduped
 * or storage is unavailable.
 */
export async function indexPlaylistPublished(opts: {
  mbid: string;
  owner: string;
  title: string;
}): Promise<boolean> {
  if (!redis) return false;
  const { mbid, owner, title } = opts;
  if (!mbid || !owner) return false;

  const created = Math.floor(Date.now() / 1000);
  const k = key(owner);

  try {
    // Look back over the dedupe window for an existing entry on the
    // same playlist. Cheap scan since MAX_PER_USER caps the set.
    const cutoff = created - DEDUPE_WINDOW_SECONDS;
    const recent = await redis.zrange<string[]>(k, cutoff, "+inf", {
      byScore: true,
    });
    let existingMember: string | null = null;
    for (const s of recent) {
      try {
        const parsed = typeof s === "string" ? JSON.parse(s) : s;
        if (
          parsed &&
          typeof parsed.mbid === "string" &&
          parsed.mbid.toLowerCase() === mbid.toLowerCase()
        ) {
          existingMember = s;
          break;
        }
      } catch {
        // skip malformed entries
      }
    }
    if (existingMember) {
      // Within dedupe window — drop the prior entry and let the new
      // one take its place at the latest timestamp.
      await redis.zrem(k, existingMember);
    }

    const payload = JSON.stringify({
      mbid,
      owner,
      title,
      created,
    } satisfies PlaylistPublishedEvent);
    await redis.zadd(k, { score: created, member: payload });
    await redis.zremrangebyrank(k, 0, -MAX_PER_USER - 1);
    await redis.expire(k, TTL_SECONDS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return playlist-published events from `owners` newer than `since`
 * (unix seconds). Caller is responsible for restricting `owners` to
 * a viewer's following list — we don't gate here so the function
 * stays viewer-agnostic and the feed page can pass its already-
 * resolved following set.
 *
 * Events are returned oldest → newest. Empty array on storage
 * outage or no matches.
 */
export async function getPlaylistPublishedEventsForOwners(
  owners: string[],
  since: number,
): Promise<PlaylistPublishedEvent[]> {
  if (!redis || owners.length === 0) return [];
  try {
    const chunks = await Promise.all(
      owners.map((o) =>
        redis!
          .zrange<string[]>(key(o), since, "+inf", { byScore: true })
          .catch(() => [] as string[]),
      ),
    );
    const out: PlaylistPublishedEvent[] = [];
    for (const chunk of chunks) {
      for (const s of chunk) {
        try {
          const parsed = typeof s === "string" ? JSON.parse(s) : s;
          if (
            parsed &&
            typeof parsed.mbid === "string" &&
            typeof parsed.owner === "string" &&
            typeof parsed.title === "string" &&
            typeof parsed.created === "number"
          ) {
            out.push(parsed as PlaylistPublishedEvent);
          }
        } catch {
          // skip malformed entries
        }
      }
    }
    out.sort((a, b) => a.created - b.created);
    return out;
  } catch {
    return [];
  }
}

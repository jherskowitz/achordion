import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Listen-along event index.
 *
 * Records when one user clicks "Listen along" on another user's
 * profile / on-air pill — a Parachord-only action that only fires
 * when the actor's Parachord desktop app is confirmed running (the
 * client-side beacon is gated on `useParachordPresence`).
 *
 * Fan-out is dual-keyed:
 *   - `listen-along:from:<actor>`  ZADDed on every click; lets the
 *      actor's followers see "X is listening along with Y" cards.
 *   - `listen-along:to:<target>`   ZADDed in parallel; lets the
 *      target see "X tuned into your stream" notifications.
 *
 * Storage shape mirrors `lib/mention-index.ts` — sorted set of
 * JSON-serialised events, capped at MAX_PER_USER, 90-day TTL on
 * each key.
 *
 * Dedupe: the `target+startedAt` pair is the natural identity of a
 * listen-along session — two clicks within DEDUPE_WINDOW_SECONDS at
 * the same target collapse into a single event so a flaky click or
 * Parachord-reconnect doesn't spam the feed.
 */

const MAX_PER_USER = 200;
const TTL_SECONDS = 60 * 60 * 24 * 90;
/** Two events from the same actor against the same target inside
 *  this window collapse to one — sized to absorb double-tap on
 *  touch + the listen-along link occasionally fanning out a couple
 *  of beacons during the Parachord handshake. */
const DEDUPE_WINDOW_SECONDS = 60;

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function fromKey(actor: string): string {
  return `listen-along:from:${actor.toLowerCase()}`;
}
function toKey(target: string): string {
  return `listen-along:to:${target.toLowerCase()}`;
}

export interface ListenAlongEvent {
  /** Unix seconds — when the click was registered. */
  created: number;
  /** Actor's LB username. */
  fromUser: string;
  /** Target's LB username (the user being listened along with). */
  toUser: string;
}

/**
 * Record one listen-along click. Idempotent within the dedupe
 * window: if `actor` already has an entry against `target` whose
 * `created` is within DEDUPE_WINDOW_SECONDS, the new event is
 * dropped on the floor and the existing one stays.
 *
 * Returns `true` when a new event was written, `false` when deduped
 * or storage is unavailable. Callers don't need to await unless
 * they care about the dedupe outcome (the API route uses it for the
 * response payload).
 */
export async function indexListenAlong(opts: {
  fromUser: string;
  toUser: string;
}): Promise<boolean> {
  if (!redis) return false;
  const actor = opts.fromUser;
  const target = opts.toUser;
  if (!actor || !target) return false;
  // No self-listen-along — users shouldn't be able to record
  // themselves as the target via a forged client payload.
  if (actor.toLowerCase() === target.toLowerCase()) return false;

  const created = Math.floor(Date.now() / 1000);
  const cutoff = created - DEDUPE_WINDOW_SECONDS;

  try {
    // Dedupe check: scan the actor's recent fan-out for the same
    // target within the window. Bounded by MAX_PER_USER so even an
    // active actor scans at most that many entries.
    const recent = await redis.zrange<string[]>(fromKey(actor), cutoff, "+inf", {
      byScore: true,
    });
    for (const s of recent) {
      try {
        const parsed = typeof s === "string" ? JSON.parse(s) : s;
        if (
          parsed &&
          typeof parsed.toUser === "string" &&
          parsed.toUser.toLowerCase() === target.toLowerCase()
        ) {
          return false;
        }
      } catch {
        // skip malformed; deduping a malformed entry is fine
      }
    }

    const payload = JSON.stringify({
      created,
      fromUser: actor,
      toUser: target,
    });
    await Promise.all([
      redis.zadd(fromKey(actor), { score: created, member: payload }),
      redis.zadd(toKey(target), { score: created, member: payload }),
    ]);
    // Trim + TTL on both keys. Negative-index trim keeps the newest
    // MAX_PER_USER entries.
    await Promise.all([
      redis.zremrangebyrank(fromKey(actor), 0, -MAX_PER_USER - 1),
      redis.zremrangebyrank(toKey(target), 0, -MAX_PER_USER - 1),
      redis.expire(fromKey(actor), TTL_SECONDS),
      redis.expire(toKey(target), TTL_SECONDS),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return listen-along events relevant to `viewer`:
 *   - Events where the viewer is the **actor** (their own clicks),
 *     so the feed reads "You listened along with X" alongside the
 *     viewer's loves / pins / etc.
 *   - Events where the viewer is the **target** (someone tuned
 *     into their stream).
 *   - Events where the **actor is in viewer's following list**
 *     (someone they follow tuned into someone else).
 *
 * The three streams overlap on edges where the viewer is following
 * themselves (impossible — filtered out below) or where the viewer
 * is BOTH the target and a follower of the actor; the (fromUser,
 * toUser, created) dedupe collapses those collisions.
 *
 * Caller must supply the viewer's following list — we don't refetch
 * it here; the feed page already has it in scope from its native
 * feed merge.
 *
 * Returns events newer than `since` (unix seconds), oldest → newest.
 * Empty array on storage outage.
 */
export async function getListenAlongEventsForViewer(
  viewer: string,
  following: string[],
  since: number,
): Promise<ListenAlongEvent[]> {
  if (!redis || !viewer) return [];
  try {
    // Three index reads in parallel: viewer-as-actor, viewer-as-
    // target, and each followed user's actor-side. Self appears in
    // its own actor slot regardless of whether the viewer follows
    // themselves; filter `viewer` out of `following` so the followed-
    // actor chunk doesn't double-pull the same slot.
    const viewerActorPromise = redis.zrange<string[]>(
      fromKey(viewer),
      since,
      "+inf",
      { byScore: true },
    );
    const targetSidePromise = redis.zrange<string[]>(toKey(viewer), since, "+inf", {
      byScore: true,
    });
    const followedActorPromise = Promise.all(
      following
        .filter((u) => u.toLowerCase() !== viewer.toLowerCase())
        .map((u) =>
          redis!
            .zrange<string[]>(fromKey(u), since, "+inf", { byScore: true })
            .catch(() => [] as string[]),
        ),
    );
    const [viewerActor, targetSide, followedActorChunks] = await Promise.all([
      viewerActorPromise,
      targetSidePromise,
      followedActorPromise,
    ]);
    const seen = new Set<string>();
    const out: ListenAlongEvent[] = [];
    const pushUnique = (s: string) => {
      try {
        const parsed = typeof s === "string" ? JSON.parse(s) : s;
        if (
          !parsed ||
          typeof parsed.created !== "number" ||
          typeof parsed.fromUser !== "string" ||
          typeof parsed.toUser !== "string"
        ) {
          return;
        }
        const k = `${parsed.fromUser.toLowerCase()}|${parsed.toUser.toLowerCase()}|${parsed.created}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push(parsed as ListenAlongEvent);
      } catch {
        // skip malformed entries
      }
    };
    for (const s of viewerActor) pushUnique(s);
    for (const s of targetSide) pushUnique(s);
    for (const chunk of followedActorChunks) {
      for (const s of chunk) pushUnique(s);
    }
    out.sort((a, b) => a.created - b.created);
    return out;
  } catch {
    return [];
  }
}

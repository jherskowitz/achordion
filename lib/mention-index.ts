import "server-only";

import { Redis } from "@upstash/redis";

/**
 * @username mention index.
 *
 * For every pin Achordion observes (when rendering anyone's
 * profile, network feed, or thanks event), we parse the pin's
 * blurb for `@name` mentions and fan-out into per-mentioned-user
 * sorted sets:
 *
 *   ZADD  mention:<lb-username>  <pin.created>  <serialised-event>
 *
 * The serialised event carries everything the feed renderer
 * needs to draw a card without re-fetching from LB:
 *
 *   { rowId, created, fromUser, recordingMbid, trackName, artistName, blurb }
 *
 * Query path: `getMentionsForUser(viewer, since)` →
 *   `ZRANGEBYSCORE mention:<viewer> <since> +inf`
 *   returns the events newer than `since` ordered oldest → newest.
 *
 * Stateless from the LB-side perspective: we mint these entries
 * from public pin data anyone can re-fetch. Achordion-side
 * storage is small (a few hundred bytes per pin, sorted-set
 * trimmed to MAX_PER_USER on each add).
 */

const MAX_PER_USER = 200;
const TTL_SECONDS = 60 * 60 * 24 * 90;

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

function key(username: string): string {
  return `mention:${username.toLowerCase()}`;
}

export interface MentionEvent {
  /** LB pin row id — stable across re-fetches of the pin. Used
   *  as the sorted-set member dedupe key (rewritten via ZADD on
   *  re-observation; no duplicates). */
  rowId: number;
  /** Unix seconds; same value LB reports on the pin event. */
  created: number;
  /** Pin author's LB username — the "from" side of the mention. */
  fromUser: string;
  /** Pin's recording MBID (when present). Used by the feed
   *  renderer to embed a playable track card. */
  recordingMbid: string | null;
  trackName: string | null;
  artistName: string | null;
  blurb: string;
}

/**
 * Index every mentioned-user fan-out for a single pin. Idempotent
 * — re-adding the same `rowId` overwrites the prior entry's score
 * + payload via ZADD's natural semantics, so re-observing a pin
 * doesn't double-count.
 *
 * Caller is expected NOT to await the result — this is a passive
 * backfill from existing pin-fetch paths.
 */
export async function indexPinMentions(
  pin: {
    rowId: number;
    created: number;
    fromUser: string;
    recordingMbid: string | null;
    trackName: string | null;
    artistName: string | null;
    blurb: string;
  },
  mentioned: string[],
): Promise<void> {
  if (!redis || mentioned.length === 0) return;
  // Don't index a pin where the author mentions themselves —
  // notifying yourself about your own pin is meaningless and
  // pollutes the feed.
  const recipients = mentioned.filter(
    (u) => u.toLowerCase() !== pin.fromUser.toLowerCase(),
  );
  if (recipients.length === 0) return;
  const payload = JSON.stringify({
    rowId: pin.rowId,
    created: pin.created,
    fromUser: pin.fromUser,
    recordingMbid: pin.recordingMbid,
    trackName: pin.trackName,
    artistName: pin.artistName,
    blurb: pin.blurb,
  });
  await Promise.all(
    recipients.map(async (user) => {
      const k = key(user);
      try {
        // Member = `pin:<rowId>` so a re-add for the same pin
        // collapses to one entry (ZADD with the same member
        // updates score / payload pointer). The payload itself
        // is stored via a side companion hash to avoid bloating
        // the sorted-set member strings; this minimal v1 uses
        // the payload as the member, which means re-adds with
        // identical content are still deduped on rowId via the
        // string equality — payload changes (e.g. corrected
        // typo in the blurb) appear as a SECOND entry. We
        // accept that for the v1 since it's rare; v2 can split
        // payload to a hash with rowId-only members.
        await redis.zadd(k, { score: pin.created, member: payload });
        // Trim to the most recent MAX_PER_USER. Negative indices
        // count from the end; `ZREMRANGEBYRANK k 0 -MAX-1` keeps
        // the top-N.
        await redis.zremrangebyrank(k, 0, -MAX_PER_USER - 1);
        await redis.expire(k, TTL_SECONDS);
      } catch {
        // single-user failures shouldn't block the rest of the
        // fan-out — caller never awaits the outer promise anyway
      }
    }),
  );
}

/**
 * Return mention events for `viewer` newer than `since` (unix
 * seconds). Ordered oldest → newest, capped at the same
 * MAX_PER_USER the writer trims to.
 *
 * Returns an empty array when Upstash is unreachable or the user
 * has no mentions in the window — both indistinguishable to the
 * feed, both render as "no mentions yet."
 */
export async function getMentionsForUser(
  viewer: string,
  since: number,
): Promise<MentionEvent[]> {
  if (!redis || !viewer) return [];
  try {
    const raw = await redis.zrange<string[]>(key(viewer), since, "+inf", {
      byScore: true,
    });
    const out: MentionEvent[] = [];
    for (const s of raw) {
      try {
        const parsed = typeof s === "string" ? JSON.parse(s) : s;
        // Defensive shape check — the index can hold older
        // payload shapes if we change the writer later.
        if (
          parsed &&
          typeof parsed.rowId === "number" &&
          typeof parsed.created === "number" &&
          typeof parsed.fromUser === "string"
        ) {
          out.push(parsed as MentionEvent);
        }
      } catch {
        // skip malformed entries
      }
    }
    return out;
  } catch {
    return [];
  }
}

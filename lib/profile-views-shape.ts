/**
 * Pure shapes + parsing for the profile-views admin tracker. Kept free
 * of `server-only` / Upstash imports so the array-parsing (the one
 * off-by-one risk) can be unit-tested without the Redis client.
 */

export interface ProfileViewRow {
  /** The viewed profile's username (the `[name]` route param). */
  name: string;
  /** Total render count. */
  views: number;
  /** Unix seconds of the most recent view, or null if unknown. */
  lastViewedAt: number | null;
}

/**
 * Parse an Upstash `ZRANGE … WITHSCORES` result — a flat array
 * `[member, score, member, score, …]` — into `{ name, views }` rows.
 * Tolerates string scores (Upstash returns numbers as strings over
 * REST) and ignores a dangling final element from a malformed reply.
 */
export function parseScoredMembers(
  raw: ReadonlyArray<string | number>,
): Array<{ name: string; views: number }> {
  const rows: Array<{ name: string; views: number }> = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const name = String(raw[i]).trim();
    if (!name) continue;
    rows.push({ name, views: Number(raw[i + 1]) || 0 });
  }
  return rows;
}

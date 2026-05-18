import "server-only";

import { unstable_cache } from "next/cache";
import {
  getListeningActivity,
  getUserDistinctArtistCount,
} from "@/lib/clients/listenbrainz";

/**
 * Listener milestone chips.
 *
 * Quantitative chips that read as "what has this person done as a
 * listener?" — total plays, distinct artists, current streak,
 * listening-since year. Pairs with the qualitative archetype chips
 * (Night owl, Discoverer, etc.); together they give the profile
 * header a stats-plus-personality identity strip without the user
 * writing anything.
 *
 * Stateless: pulls from the same /stats/user/<name>/* endpoints
 * the Stats page already reads, all cached for 24h via
 * `unstable_cache`. Empty / cold users get zero chips — the
 * thresholds below ensure we never label a brand-new account
 * with embarrassing milestones like "5 plays".
 */

export interface Milestone {
  id: string;
  label: string;
  /** Hover-only context that explains the underlying number. */
  why: string;
}

interface RawData {
  totalPlays: number;
  /** LB's `total_artist_count` — exact lifetime distinct-artist count,
   *  or null when LB didn't include the field (older deployments) so
   *  we skip the chip rather than render a misleading "0 artists". */
  distinctArtists: number | null;
  currentStreakDays: number;
  /** Year of the user's first non-empty listening-activity bucket,
   *  or null when we can't determine it from the all-time data. */
  firstListenYear: number | null;
}

async function fetchData(name: string): Promise<RawData> {
  const [activityAllTime, activityMonth, distinctArtists] = await Promise.all([
    getListeningActivity(name, "all_time").catch(
      () => [] as Awaited<ReturnType<typeof getListeningActivity>>,
    ),
    getListeningActivity(name, "month").catch(
      () => [] as Awaited<ReturnType<typeof getListeningActivity>>,
    ),
    // LB exposes the exact lifetime distinct-artist count as
    // `total_artist_count` on the top-artists payload. Use the
    // count=1 variant so we don't pull 500 artist rows just to
    // count them. Returns null on outage / older LB; we treat
    // null as "unknown" and skip the chip.
    getUserDistinctArtistCount(name, "all_time"),
  ]);

  // Total plays = sum of all-time bucket listen_counts. LB's
  // listening-activity for `range=all_time` returns one bucket per
  // year, so the sum is the lifetime total.
  const totalPlays = activityAllTime.reduce(
    (s, b) => s + (b.listen_count ?? 0),
    0,
  );

  // First listen year = oldest bucket with listen_count > 0.
  // Buckets arrive ordered oldest → newest; walk forward to find
  // the first non-empty one. Convert from_ts (unix seconds) to year.
  let firstListenYear: number | null = null;
  for (const b of activityAllTime) {
    if ((b.listen_count ?? 0) > 0) {
      firstListenYear = new Date(b.from_ts * 1000).getUTCFullYear();
      break;
    }
  }

  // Current streak = trailing run of consecutive non-empty daily
  // buckets in the past-month activity. Same shape as the bio's
  // streak computation.
  let currentStreakDays = 0;
  for (let i = activityMonth.length - 1; i >= 0; i--) {
    if ((activityMonth[i].listen_count ?? 0) > 0) currentStreakDays++;
    else break;
  }

  return {
    totalPlays,
    distinctArtists,
    currentStreakDays,
    firstListenYear,
  };
}

/** Format a play count with a thousand separator and `k`/`M`
 *  suffix where it tightens up. 12,345 → "12k", 1,234,000 → "1.2M". */
function formatPlayCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return n.toString();
}

function composeMilestones(data: RawData): Milestone[] {
  const out: Milestone[] = [];

  if (data.totalPlays >= 500) {
    out.push({
      id: "total-plays",
      label: `${formatPlayCount(data.totalPlays)} plays`,
      why: `${data.totalPlays.toLocaleString()} listens scrobbled to ListenBrainz, all time.`,
    });
  }

  if (data.distinctArtists !== null && data.distinctArtists >= 50) {
    // LB exposes the exact count via `total_artist_count`, so the
    // chip is precise — no more ">500 artists" floor.
    out.push({
      id: "distinct-artists",
      label: `${formatPlayCount(data.distinctArtists)} artists`,
      why: `${data.distinctArtists.toLocaleString()} distinct artists in their listening history.`,
    });
  }

  if (data.currentStreakDays >= 7) {
    out.push({
      id: "streak",
      label: `${data.currentStreakDays}-day streak`,
      why: `${data.currentStreakDays} consecutive days with at least one listen.`,
    });
  }

  if (data.firstListenYear) {
    const yearsAgo = new Date().getUTCFullYear() - data.firstListenYear;
    if (yearsAgo >= 1) {
      out.push({
        id: "listening-since",
        label: `Listening since ${data.firstListenYear}`,
        why: `First scrobble to ListenBrainz was in ${data.firstListenYear} — ${yearsAgo} year${yearsAgo === 1 ? "" : "s"} of history here.`,
      });
    }
  }

  return out;
}

export async function getListenerMilestones(
  name: string,
): Promise<Milestone[]> {
  if (!name) return [];
  const cached = unstable_cache(
    async () => composeMilestones(await fetchData(name)),
    // v3 — distinct-artists chip now reads LB's exact
    // `total_artist_count` instead of the count=500 array length.
    // Bumping the cache key evicts older entries that may still
    // hold the v2 ">500 artists" floor label even for users who
    // now have an exact count available.
    ["listener-milestones-v3", name.toLowerCase()],
    {
      revalidate: 86400,
      tags: [`listener-milestones:${name.toLowerCase()}`],
    },
  );
  return cached();
}

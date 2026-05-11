import "server-only";

import { unstable_cache } from "next/cache";
import {
  getDailyActivity,
  getUserTopArtists,
  getUserTopRecordings,
} from "@/lib/clients/listenbrainz";

/**
 * Listener archetype chips.
 *
 * Two-or-three personality tags derived live from LB stats and
 * surfaced on the profile page next to the bio. Each archetype is
 * a binary match (qualifies / doesn't); the helper returns the
 * matching set so the renderer can show all of them at once.
 *
 * Math choices are intentionally simple — each archetype uses ONE
 * stat with a clear threshold. Avoids the "horoscope of vague
 * adjectives" problem by tying each tag to a concrete behavior any
 * user can verify from their own Stats page.
 *
 * Stateless: every archetype is computed live from the same
 * /stats/user/<name>/* endpoints the Stats page already uses.
 * Cached 24h per user via `unstable_cache`.
 */

export interface Archetype {
  id: string;
  label: string;
  /** Short helper text shown in a `title` attribute on the chip — the
   *  "why this label?" explanation for hovering users. */
  why: string;
  /** Visual tone for the chip — drives Tailwind classes in the
   *  renderer. "primary" = brand-tinted (rare / standout traits);
   *  "neutral" = muted (common / context). */
  tone: "primary" | "neutral";
}

/** Gini coefficient over a list of non-negative values. 0 = perfectly
 *  even distribution; 1 = all mass on one item. Used here as the
 *  "concentration" signal across a user's top tracks. */
function gini(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    weighted += (i + 1) * sorted[i];
  }
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

/** Bucket the peak listening hour into a daypart label. Returns null
 *  for daytime peaks — afternoon listening is too universal to read
 *  as a personality trait. */
function dayPartFromPeakHour(
  hour: number,
): { label: "Night owl" | "Morning listener"; why: string } | null {
  // 0-5 — small hours. "Night owl" reads cleanly.
  if (hour >= 0 && hour <= 5) {
    return {
      label: "Night owl",
      why: `Listens most at ${formatHour(hour)} — late-night / small-hours peak.`,
    };
  }
  // 5-9 — pre-work morning window. "Morning listener" reads cleanly.
  if (hour >= 5 && hour <= 9) {
    return {
      label: "Morning listener",
      why: `Listens most at ${formatHour(hour)} — pre-work morning peak.`,
    };
  }
  // 10am-11pm: no chip. "Afternoon listener" and "Evening listener"
  // describe roughly everyone, so they'd be noise instead of signal.
  return null;
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

async function computeArchetypes(name: string): Promise<Archetype[]> {
  // Three independent stat fetches in parallel — each one is a hot
  // cache hit when the Stats page or auto-bio ran first for this
  // user, so steady-state cost is near-zero.
  const [topTracksAllTime, topArtistsMonth, dailyActivity] = await Promise.all([
    getUserTopRecordings(name, "all_time", 100).catch(() => []),
    getUserTopArtists(name, "month", 25).catch(() => []),
    getDailyActivity(name, "all_time").catch(
      () => ({}) as Awaited<ReturnType<typeof getDailyActivity>>,
    ),
  ]);

  const out: Archetype[] = [];

  // ─── Concentration (same-thing-on-repeat vs broad listener) ──
  // Gini > 0.6 → top tracks dominate; < 0.35 → very even spread.
  // Threshold picked from sampling: real "obsessive" listeners
  // (top track = 5%+ of total plays) clear 0.6 comfortably; "broad"
  // listeners with no concentration land below 0.35.
  if (topTracksAllTime.length >= 25) {
    const g = gini(topTracksAllTime.map((t) => t.listen_count));
    if (g > 0.6) {
      out.push({
        id: "same-thing-on-repeat",
        label: "Same-thing-on-repeat",
        why: "A handful of favourite tracks dominate their listening history — they return to the same songs over and over.",
        tone: "primary",
      });
    } else if (g < 0.35) {
      out.push({
        id: "broad-listener",
        label: "Broad listener",
        why: "Their plays are spread evenly across hundreds of tracks — no single song dominates.",
        tone: "neutral",
      });
    }
  }

  // ─── Time-of-day ────────────────────────────────────────────
  // Sum listen counts across every weekday for each of the 24
  // hours; the argmax hour is the user's peak. Only the extreme
  // dayparts (small hours / pre-work morning) become chips —
  // afternoon and evening peaks aren't differentiated enough.
  const hourTotals = new Array<number>(24).fill(0);
  for (const dayName of Object.keys(dailyActivity)) {
    for (const slot of dailyActivity[dayName]) {
      hourTotals[slot.hour] += slot.listen_count;
    }
  }
  const totalPlays = hourTotals.reduce((s, v) => s + v, 0);
  if (totalPlays >= 100) {
    const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
    const dp = dayPartFromPeakHour(peakHour);
    if (dp) {
      out.push({
        id: dp.label.toLowerCase().replace(/\s+/g, "-"),
        label: dp.label,
        why: dp.why,
        tone: "primary",
      });
    }
  }

  // ─── Discovery rate ─────────────────────────────────────────
  // Past-month top artists that DON'T appear in all-time top 100
  // are new (or freshly-re-discovered) for this user. ≥40% new →
  // "Discoverer". ≤10% new → "Habitual listener" — almost
  // entirely re-listening their established favourites.
  if (topArtistsMonth.length >= 10) {
    const [topArtistsAllTime] = await Promise.all([
      getUserTopArtists(name, "all_time", 100).catch(() => []),
    ]);
    const allTimeSet = new Set(
      topArtistsAllTime
        .map((a) => a.artist_mbid ?? a.artist_name.toLowerCase())
        .filter(Boolean),
    );
    const newCount = topArtistsMonth.filter((a) => {
      const key = a.artist_mbid ?? a.artist_name.toLowerCase();
      return !allTimeSet.has(key);
    }).length;
    const newPct = newCount / topArtistsMonth.length;
    if (newPct >= 0.4) {
      out.push({
        id: "discoverer",
        label: "Discoverer",
        why: `${newCount} of this month's top ${topArtistsMonth.length} artists weren't in the all-time top 100 — actively pulling in new music.`,
        tone: "primary",
      });
    } else if (newPct <= 0.1 && topArtistsAllTime.length >= 25) {
      out.push({
        id: "habitual-listener",
        label: "Habitual listener",
        why: `This month is almost entirely the all-time favourites — comfort relistens, not discovery.`,
        tone: "neutral",
      });
    }
  }

  // Cap at 3 — more starts to read like a horoscope. "primary"
  // tones sort ahead of "neutral" since brand-tinted chips are the
  // standout signal.
  return out
    .sort((a, b) => {
      if (a.tone === b.tone) return 0;
      return a.tone === "primary" ? -1 : 1;
    })
    .slice(0, 3);
}

/**
 * Public entry point. Cached 24h per username — archetypes are
 * stable enough at that cadence and aggressive caching keeps every
 * profile-page render free of the underlying LB round-trips.
 */
export async function getListenerArchetypes(
  name: string,
): Promise<Archetype[]> {
  if (!name) return [];
  const cached = unstable_cache(
    () => computeArchetypes(name),
    // v2 — tooltip copy reworded to remove math jargon
    // ("Gini X.XX"). Stale v1 entries still carry the developer-
    // facing phrasing.
    ["listener-archetypes-v2", name.toLowerCase()],
    {
      revalidate: 86400,
      tags: [`listener-archetypes:${name.toLowerCase()}`],
    },
  );
  return cached();
}

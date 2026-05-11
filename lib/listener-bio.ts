import "server-only";

import { unstable_cache } from "next/cache";
import { getUserTopArtists } from "@/lib/clients/listenbrainz";

/**
 * Auto-generated listener bio.
 *
 * Composes a short "who is this person as a listener *right now*?"
 * intro out of recent LB stats. Used as the fallback when a
 * profile owner hasn't linked a Bluesky bio (which is what shows up
 * there otherwise).
 *
 * Scope is intentionally narrow: just the "currently spinning"
 * clause. Lifetime / month stats — total plays, distinct artists,
 * streak, listening-since year — live on the milestone chip strip
 * (`<ListenerMilestones>`), not in this sentence, so the two
 * surfaces don't restate the same numbers.
 *
 * Stateless by design — derived live from `/stats/user/<name>/*`
 * endpoints the existing Stats page reads. `unstable_cache` keeps
 * a 24h slot per username so a busy profile page render is one
 * cache hit, not a round-trip.
 *
 * The return is structured (a list of segments) rather than a raw
 * string so the renderer can wrap artist names in `<Link>` to
 * their artist pages. Plain text for the connective tissue, typed
 * Artist refs for the variable slots.
 *
 * Drops to null when no "currently spinning" artist clears the
 * differentiation threshold (cold users with flat distributions).
 */

export type BioSegment =
  | { kind: "text"; value: string }
  | {
      kind: "artist";
      name: string;
      mbid: string | null;
    };

export interface ListenerBio {
  segments: BioSegment[];
}

/**
 * Inclusive lower bound on a "currently spinning" artist's monthly
 * play count, expressed as a multiple of the median monthly play
 * count across the user's top-25. Without this filter every new
 * user with a flat play distribution would read as "currently
 * spinning X, Y, Z" when really they're spinning everything
 * equally.
 */
const TOP_ARTIST_MEDIAN_MULTIPLIER = 1.5;

interface RawSnapshot {
  topArtists: Array<{
    artist_name: string;
    artist_mbid?: string | null;
    listen_count: number;
  }>;
}

async function fetchSnapshot(name: string): Promise<RawSnapshot | null> {
  const topArtists = await getUserTopArtists(name, "month", 25).catch(() => []);
  if (topArtists.length === 0) return null;
  return { topArtists };
}

function composeBio(snapshot: RawSnapshot): ListenerBio | null {
  // "Currently spinning" clause — top 1–3 artists this month, but
  // only those that meaningfully stand out from the user's median.
  // Volume + streak clauses live on the milestone chip strip, not
  // here.
  const counts = snapshot.topArtists.map((a) => a.listen_count);
  const sortedCounts = counts.slice().sort((a, b) => a - b);
  const median =
    sortedCounts.length === 0
      ? 0
      : sortedCounts[Math.floor(sortedCounts.length / 2)];
  const threshold = Math.max(2, median * TOP_ARTIST_MEDIAN_MULTIPLIER);
  const standouts = snapshot.topArtists
    .filter((a) => a.listen_count >= threshold)
    .slice(0, 3);

  if (standouts.length === 0) return null;

  const segments: BioSegment[] = [{ kind: "text", value: "Currently spinning " }];
  standouts.forEach((a, i) => {
    if (i > 0) {
      segments.push({
        kind: "text",
        value:
          i === standouts.length - 1
            ? standouts.length === 2
              ? " and "
              : ", and "
            : ", ",
      });
    }
    segments.push({
      kind: "artist",
      name: a.artist_name,
      mbid: a.artist_mbid ?? null,
    });
  });
  segments.push({ kind: "text", value: "." });
  return { segments };
}

/**
 * Public entry point. Pulls the latest snapshot and composes the
 * bio. Cached 24h per username — bios shift slowly enough that
 * day-old data is fine, and aggressive caching keeps every profile
 * card render free of the underlying LB round-trips.
 *
 * Returns `null` when no clause can be composed (cold user, LB
 * outage, etc.) — callers fall through to no-bio rendering.
 */
export async function getListenerBio(
  name: string,
): Promise<ListenerBio | null> {
  if (!name) return null;
  const cached = unstable_cache(
    async () => {
      const snapshot = await fetchSnapshot(name);
      if (!snapshot) return null;
      return composeBio(snapshot);
    },
    // v2 — composer scope narrowed to the "currently spinning"
    // clause only (volume + streak moved to <ListenerMilestones>).
    // Stale v1 entries still carry the volume-suffixed sentence
    // shape that duplicates the milestone chips.
    ["listener-bio-v2", name.toLowerCase()],
    {
      revalidate: 86400,
      tags: [`listener-bio:${name.toLowerCase()}`],
    },
  );
  return cached();
}

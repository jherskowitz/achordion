import {
  getUserTopArtists,
  getUserTopRecordings,
} from "@/lib/clients/listenbrainz";

/**
 * Pull every artist with a non-trivial listen count from LB and
 * return the set of MBIDs whose listen_count exceeds the supplied
 * threshold. Used by Recommended Artists rails to filter out
 * artists the user already plays a lot. Threshold === null disables
 * exclusion (slider at 0).
 *
 * 1000 is LB's documented per-page max for /stats/user/.../artists.
 * Wide net so even the user's "rank 500" artist gets filtered out
 * if its listen count crosses the threshold — the previous
 * top-100-only approach missed those.
 */
export async function buildExcludedArtistSet(
  username: string,
  threshold: number | null,
): Promise<Set<string>> {
  if (threshold === null) return new Set();
  const top = await getUserTopArtists(username, "all_time", 1000).catch(
    () => [],
  );
  const out = new Set<string>();
  for (const a of top) {
    if (!a.artist_mbid) continue;
    if (a.listen_count > threshold) out.add(a.artist_mbid);
  }
  return out;
}

/**
 * Same shape, but for recordings. Used by Recommended Tracks rails
 * so the slider hides specific tracks the user has played a lot —
 * not just every track by an artist they like.
 */
export async function buildExcludedRecordingSet(
  username: string,
  threshold: number | null,
): Promise<Set<string>> {
  if (threshold === null) return new Set();
  const top = await getUserTopRecordings(username, "all_time", 1000).catch(
    () => [],
  );
  const out = new Set<string>();
  for (const r of top) {
    if (!r.recording_mbid) continue;
    if (r.listen_count > threshold) out.add(r.recording_mbid);
  }
  return out;
}

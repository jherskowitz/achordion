import { getUserTopArtists } from "@/lib/clients/listenbrainz";
import { clampFamiliarity } from "@/lib/familiarity";

/**
 * Build the set of artist MBIDs to hide from Recommended Artists for a
 * given familiarity slider value, by play-RANK percentile.
 *
 * `familiarity` 0 hides nothing (show everything, familiar included).
 * 100 hides every artist the user has ever played (only never-heard
 * recommendations remain). In between, hides the user's top
 * `familiarity`% most-played artists.
 *
 * Why rank, not an absolute listen-count threshold: heavy listeners
 * have almost all of their artists above any small count, so an
 * absolute threshold saturates and the discovery half of the slider
 * goes dead (every value from ~50→100 excludes the same set). A
 * percentile of the user's OWN distribution keeps the full range live
 * regardless of how much they listen.
 *
 * 1000 is LB's documented per-page max for /stats/user/.../artists —
 * a wide enough net that even a deep-catalog artist is ranked.
 */
export async function buildExcludedArtistSet(
  username: string,
  familiarity: number,
): Promise<Set<string>> {
  const fam = clampFamiliarity(familiarity);
  if (fam <= 0) return new Set();
  const top = await getUserTopArtists(username, "all_time", 1000).catch(
    () => [],
  );
  // Played artists, most-played first. (LB returns them ranked, but
  // sort defensively so the percentile cut is exact.)
  const played = top
    .filter((a) => a.artist_mbid && a.listen_count > 0)
    .sort((a, b) => b.listen_count - a.listen_count);
  if (played.length === 0) return new Set();
  const cut = Math.round((fam / 100) * played.length);
  return new Set(played.slice(0, cut).map((a) => a.artist_mbid as string));
}

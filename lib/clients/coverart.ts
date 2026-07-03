/**
 * CoverArtArchive helpers — pure URL builders, safe in both server and
 * client components. The CAA URL pattern is deterministic: given an MBID
 * (and optionally a caa_id), the cover-art URL is fully constructed
 * client-side, so no fetch is needed and no secrets are involved.
 */

const CAA_BASE = "https://coverartarchive.org";

export type CaaSize = 250 | 500 | 1200;

export function caaReleaseUrl(mbid: string, size: CaaSize = 500): string {
  return `${CAA_BASE}/release/${mbid}/front-${size}`;
}

export function caaReleaseGroupUrl(mbid: string, size: CaaSize = 500): string {
  return `${CAA_BASE}/release-group/${mbid}/front-${size}`;
}

/**
 * Direct cover-art URL for a listen. Prefers the LB-provided caa hint, falls
 * back to release/release-group MBIDs in the listen metadata.
 */
export function caaUrlFromListen(
  metadata: {
    // LB sends `null` (not just omits) for MBIDs it couldn't resolve,
    // so every field here is nullable. The function null-checks each
    // one regardless — this just keeps the types honest.
    additional_info?: {
      release_mbid?: string | null;
      release_group_mbid?: string | null;
    } | null;
    mbid_mapping?: {
      release_mbid?: string | null;
      caa_id?: number | string | null;
      caa_release_mbid?: string | null;
    } | null;
  },
  size: CaaSize = 250,
): string | null {
  const m = metadata.mbid_mapping;
  if (m?.caa_release_mbid && m.caa_id) {
    return `https://archive.org/download/mbid-${m.caa_release_mbid}/mbid-${m.caa_release_mbid}-${m.caa_id}_thumb${size}.jpg`;
  }
  const releaseMbid =
    metadata.additional_info?.release_mbid ?? m?.release_mbid ?? null;
  if (releaseMbid) return caaReleaseUrl(releaseMbid, size);
  const rgMbid = metadata.additional_info?.release_group_mbid;
  if (rgMbid) return caaReleaseGroupUrl(rgMbid, size);
  return null;
}

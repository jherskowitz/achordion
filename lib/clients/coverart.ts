import "server-only";

/**
 * CoverArtArchive doesn't need to be fetched server-side at all — the public
 * URL pattern is deterministic. We just resolve a URL and let next/image
 * handle the rest. We include a HEAD-check helper for cases where we want
 * to know whether art exists before rendering.
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
    additional_info?: {
      release_mbid?: string;
      release_group_mbid?: string;
    };
    mbid_mapping?: {
      release_mbid?: string;
      caa_id?: number | string;
      caa_release_mbid?: string;
    };
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

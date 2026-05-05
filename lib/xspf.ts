import type { LbRadioTrack, PlaylistDetail } from "@/lib/clients/listenbrainz";

/** Slugify a name for use in an XSPF filename. */
export function xspfFilenameSlug(name: string): string {
  return (
    name.replace(/[^\w\d\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) ||
    "tracks"
  );
}

/** Wrap an XSPF document in a download Response. */
export function xspfDownloadResponse(xml: string, baseFilename: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xspf+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseFilename}.xspf"`,
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    },
  });
}

/** XML-escape text content for elements + attributes. */
function xe(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function trackXml(t: LbRadioTrack): string {
  const lines: string[] = ["    <track>"];
  lines.push(`      <title>${xe(t.title)}</title>`);
  if (t.artistName) lines.push(`      <creator>${xe(t.artistName)}</creator>`);
  if (t.releaseName) lines.push(`      <album>${xe(t.releaseName)}</album>`);
  if (t.durationMs) lines.push(`      <duration>${t.durationMs}</duration>`);
  if (t.recordingMbid) {
    lines.push(
      `      <identifier>https://musicbrainz.org/recording/${t.recordingMbid}</identifier>`,
    );
  }
  if (t.releaseMbid) {
    lines.push(
      `      <info>https://musicbrainz.org/release/${t.releaseMbid}</info>`,
    );
  }
  lines.push("    </track>");
  return lines.join("\n");
}

/**
 * Same as <track> from `playlistToXspf`, but for non-LB-playlist
 * sources (recent listens, loved, top tracks). Same field shape, same
 * spec rendering.
 */
export interface XspfTrack {
  title: string;
  artistName?: string | null;
  releaseName?: string | null;
  recordingMbid?: string | null;
  releaseMbid?: string | null;
  durationMs?: number | null;
}

function genericTrackXml(t: XspfTrack): string {
  const lines: string[] = ["    <track>"];
  lines.push(`      <title>${xe(t.title)}</title>`);
  if (t.artistName) lines.push(`      <creator>${xe(t.artistName)}</creator>`);
  if (t.releaseName) lines.push(`      <album>${xe(t.releaseName)}</album>`);
  if (t.durationMs) lines.push(`      <duration>${t.durationMs}</duration>`);
  if (t.recordingMbid) {
    lines.push(
      `      <identifier>https://musicbrainz.org/recording/${t.recordingMbid}</identifier>`,
    );
  }
  if (t.releaseMbid) {
    lines.push(
      `      <info>https://musicbrainz.org/release/${t.releaseMbid}</info>`,
    );
  }
  lines.push("    </track>");
  return lines.join("\n");
}

/**
 * Render an arbitrary list of tracks as an XSPF 1.0 document. Used for
 * derived lists (recent listens, loved, top tracks) that don't have a
 * canonical ListenBrainz playlist row.
 */
export function tracksToXspf(
  meta: {
    title: string;
    creator?: string;
    annotation?: string;
    /** Canonical URL identifying the source list (e.g. the user's
     *  recently-played page). Echoed into <identifier> + <info>. */
    identifier?: string;
  },
  tracks: XspfTrack[],
): string {
  const head: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
    `  <title>${xe(meta.title)}</title>`,
  ];
  if (meta.creator) head.push(`  <creator>${xe(meta.creator)}</creator>`);
  if (meta.annotation) {
    head.push(`  <annotation>${xe(meta.annotation)}</annotation>`);
  }
  if (meta.identifier) {
    head.push(`  <identifier>${xe(meta.identifier)}</identifier>`);
    head.push(`  <info>${xe(meta.identifier)}</info>`);
  }
  const trackXmls = tracks.map(genericTrackXml).join("\n");
  return [
    head.join("\n"),
    "  <trackList>",
    trackXmls || "",
    "  </trackList>",
    "</playlist>",
    "",
  ].join("\n");
}

/**
 * Render a playlist as an XSPF 1.0 document.
 * Spec: https://xspf.org/xspf-v1.html
 */
export function playlistToXspf(
  playlist: PlaylistDetail,
  identifier: string,
): string {
  const head: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
    `  <title>${xe(playlist.title)}</title>`,
  ];
  if (playlist.creator) {
    head.push(`  <creator>${xe(playlist.creator)}</creator>`);
  }
  if (playlist.annotation) {
    head.push(`  <annotation>${xe(playlist.annotation)}</annotation>`);
  }
  if (playlist.date) {
    head.push(`  <date>${xe(playlist.date)}</date>`);
  }
  head.push(`  <identifier>${xe(identifier)}</identifier>`);
  head.push(`  <info>${xe(identifier)}</info>`);

  const tracks = playlist.tracks.map(trackXml).join("\n");
  return [
    head.join("\n"),
    "  <trackList>",
    tracks || "",
    "  </trackList>",
    "</playlist>",
    "",
  ].join("\n");
}

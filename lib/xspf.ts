import type { LbRadioTrack, PlaylistDetail } from "@/lib/clients/listenbrainz";

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

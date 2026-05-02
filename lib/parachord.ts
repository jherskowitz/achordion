/**
 * Helpers for constructing parachord:// protocol URLs.
 * Spec: parachord-desktop/docs/protocol-schema.md
 */

const PROTOCOL = "parachord://";

export interface ParachordTrack {
  /** Track title (required). */
  title: string;
  /** Artist name (required). */
  artist: string;
  /** Album / release name (optional). */
  album?: string;
  /** Duration in SECONDS (not ms — protocol spec). */
  duration?: number;
}

/** UTF-8 safe base64 — works in both Node (server) and browser. */
function utf8Base64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }
  // Browser fallback
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Single track playback: parachord://play?artist=X&title=Y */
export function parachordPlayTrack(track: {
  artist: string;
  title: string;
}): string {
  const params = new URLSearchParams({
    artist: track.artist,
    title: track.title,
  });
  return `${PROTOCOL}play?${params}`;
}

/** Queue add: parachord://queue/add?artist=X&title=Y&album=Z */
export function parachordQueueAdd(track: ParachordTrack): string {
  const params = new URLSearchParams({
    artist: track.artist,
    title: track.title,
  });
  if (track.album) params.set("album", track.album);
  return `${PROTOCOL}queue/add?${params}`;
}

/** Open artist page in Parachord. */
export function parachordOpenArtist(name: string): string {
  return `${PROTOCOL}artist/${encodeURIComponent(name)}`;
}

/** Open album page in Parachord. */
export function parachordOpenAlbum(artist: string, title: string): string {
  return `${PROTOCOL}album/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
}

/**
 * Import a playlist (album, LB Radio station, etc.) into Parachord.
 * Tracks travel as base64-encoded JSON. Protocol caps the encoded payload
 * at 100KB and 500 tracks — we trim to be safe.
 */
export function parachordImportPlaylist(playlist: {
  title: string;
  creator?: string;
  tracks: ParachordTrack[];
}): string {
  const trimmed = playlist.tracks.slice(0, 500).map((t) => ({
    title: t.title,
    artist: t.artist,
    ...(t.album ? { album: t.album } : {}),
    ...(t.duration ? { duration: Math.round(t.duration) } : {}),
  }));
  const json = JSON.stringify(trimmed);
  const base64 = utf8Base64(json);
  const params = new URLSearchParams({
    title: playlist.title,
    creator: playlist.creator ?? "Achordion",
    tracks: base64,
  });
  return `${PROTOCOL}import?${params}`;
}

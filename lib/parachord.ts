/**
 * Helpers for constructing parachord:// protocol URLs.
 * Spec: parachord-desktop/docs/protocol-schema.md
 *
 * The play/{album,playlist,radio} family was added in
 * Parachord/parachord#755 — a single URL hands a tracklist (or seed) to
 * Parachord without mutating the user's library, so callers no longer
 * need the play-then-queue HTTP-shim dance.
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

function encodeTracks(tracks: ParachordTrack[]): string {
  const trimmed = tracks.slice(0, 500).map((t) => ({
    title: t.title,
    artist: t.artist,
    ...(t.album ? { album: t.album } : {}),
    ...(t.duration ? { duration: Math.round(t.duration) } : {}),
  }));
  return utf8Base64(JSON.stringify(trimmed));
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

/**
 * Play an album in Parachord (PR #755). Caller passes whichever
 * identifier they have — Parachord picks the best resolver. Prefer
 * `mbid` when available; fall back to `artist`+`title` for searches
 * (e.g. RSS-fed albums where we haven't resolved an MBID yet).
 */
export function parachordPlayAlbum(input: {
  mbid?: string;
  artist?: string;
  title?: string;
  spotify?: string;
  applemusic?: string;
  /** XSPF / JSPF / generic JSON tracklist URL. */
  url?: string;
  /** Inline tracklist when no public URL is available. */
  tracks?: ParachordTrack[];
  shuffle?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.mbid) params.set("mbid", input.mbid);
  if (input.spotify) params.set("spotify", input.spotify);
  if (input.applemusic) params.set("applemusic", input.applemusic);
  if (input.url) params.set("url", input.url);
  if (input.artist) params.set("artist", input.artist);
  if (input.title) params.set("title", input.title);
  if (input.tracks?.length) params.set("tracks", encodeTracks(input.tracks));
  if (input.shuffle) params.set("shuffle", "1");
  return `${PROTOCOL}play/album?${params}`;
}

/**
 * Play a playlist in Parachord (PR #755). Plays the tracklist without
 * mutating the user's library (use `parachordImportPlaylist` for the
 * mutating case).
 */
export function parachordPlayPlaylist(input: {
  /** XSPF / JSPF / generic JSON tracklist URL. */
  url?: string;
  /** Inline tracklist when no public URL is available. */
  tracks?: ParachordTrack[];
  shuffle?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.url) params.set("url", input.url);
  if (input.tracks?.length) params.set("tracks", encodeTracks(input.tracks));
  if (input.shuffle) params.set("shuffle", "1");
  return `${PROTOCOL}play/playlist?${params}`;
}

/**
 * Play a radio station in Parachord (PR #755). Three modes:
 *  - Mode B: pass `artist` (or `tag`/`prompt`) — falls through to the
 *    in-app spinoff seed.
 *  - Mode C: pass `url` — Parachord uses the URL as the initial pool
 *    AND auto-refills from the same URL when the queue runs low.
 *  - Mode C-inline: pass `tracks` (initial pool) plus `refill` (URL to
 *    fetch more from when low).
 */
export function parachordPlayRadio(input: {
  artist?: string;
  tag?: string;
  prompt?: string;
  url?: string;
  tracks?: ParachordTrack[];
  refill?: string;
  displayName?: string;
  shuffle?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.artist) params.set("artist", input.artist);
  if (input.tag) params.set("tag", input.tag);
  if (input.prompt) params.set("prompt", input.prompt);
  if (input.url) params.set("url", input.url);
  if (input.tracks?.length) params.set("tracks", encodeTracks(input.tracks));
  if (input.refill) params.set("refill", input.refill);
  if (input.displayName) params.set("name", input.displayName);
  if (input.shuffle) params.set("shuffle", "1");
  return `${PROTOCOL}play/radio?${params}`;
}

/**
 * Import a playlist into Parachord's library. Use when the caller
 * specifically wants a saved playlist row in Parachord (not just a
 * one-shot play). For ephemeral playback prefer `parachordPlayPlaylist`.
 */
export function parachordImportPlaylist(playlist: {
  title: string;
  creator?: string;
  tracks: ParachordTrack[];
}): string {
  const params = new URLSearchParams({
    title: playlist.title,
    creator: playlist.creator ?? "Achordion",
    tracks: encodeTracks(playlist.tracks),
  });
  return `${PROTOCOL}import?${params}`;
}

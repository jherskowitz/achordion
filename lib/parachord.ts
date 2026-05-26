/**
 * Helpers for constructing Parachord deep-link URLs.
 *
 * As of 2026-05-21, every URL we emit uses the HTTPS Universal Link /
 * App Link form (`https://parachord.com/<verb>`) instead of the
 * legacy custom scheme (`parachord://<verb>`):
 *
 *   - **App installed (any OS)** — the OS routes the HTTPS URL to
 *     Parachord via the verified `assetlinks.json` / AASA association,
 *     and the in-app deep-link handler (`DeepLinkHandler.parseParachordHttps`
 *     on Android, equivalent shim on iOS) rewrites it back into the
 *     same `parachord://` shape the existing protocol parser already
 *     understands.
 *   - **App not installed (mobile)** — the browser loads
 *     `parachord.com/<verb>?<query>`, which server-renders a "Get
 *     Parachord" pitch with the destination context preserved. No
 *     OS-level "Cannot Open Page" alert.
 *   - **Desktop browser** — same fallback page as above; the legacy
 *     `parachord://` form is still handled by the desktop client when
 *     it's running, but the HTTPS form gets us a clean preview card
 *     in Slack / Discord / iMessage and a useful page when shared as
 *     a plain link.
 *
 * The custom `parachord://` scheme stays valid (in-app webviews,
 * OAuth callbacks, native share intents) — Parachord side accepts
 * both. Only the URL Achordion *emits* changes here.
 *
 * Spec / context: [issue #63](https://github.com/jherskowitz/achordion/issues/63).
 * The play/{album,playlist,radio} family was added in
 * Parachord/parachord#755 — a single URL hands a tracklist (or seed)
 * to Parachord without mutating the user's library, so callers no
 * longer need the play-then-queue HTTP-shim dance.
 */

const PROTOCOL = "https://parachord.com/";

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
 *    fetch more from when low). The inline pool is intentionally
 *    capped (see `INLINE_RADIO_POOL_CAP` below) — Parachord's
 *    `PoolRefiller` fetches more from `refill` as the queue drains,
 *    so callers should pass the full upstream tracklist and trust
 *    the cap to keep the URL under Chrome-on-Android's intent-
 *    dispatch byte ceiling.
 */
/**
 * Cap on the inline initial pool when `refill` is also set.
 *
 * Chrome on Android downgrades intent dispatch to a launcher intent
 * (no `data` URI, app receives a vanilla launch with nothing to act
 * on) once the URL exceeds ~7-8KB. Without a cap, the LB-Radio
 * caller in particular inlines all 50 tracks (~7.5KB encoded), which
 * trips the threshold and breaks Radio playback on Android Chrome —
 * see Achordion issue #54.
 *
 * 5 is large enough to cover the first ~15 minutes of listening
 * without the refill having to land instantly, and small enough that
 * the encoded payload stays around ~750 bytes. Parachord-Android's
 * `PoolRefiller` triggers when pool size drops below 3, so by the
 * time the second track plays we've already kicked off the next
 * refill batch.
 *
 * Mode B (tracks only, no refill) deliberately doesn't cap — those
 * callers genuinely need the full pool because nothing's going to
 * top it up. Their byte budget is the caller's responsibility.
 */
const INLINE_RADIO_POOL_CAP = 5;
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
  if (input.tracks?.length) {
    const slice = input.refill
      ? input.tracks.slice(0, INLINE_RADIO_POOL_CAP)
      : input.tracks;
    params.set("tracks", encodeTracks(slice));
  }
  if (input.refill) params.set("refill", input.refill);
  if (input.displayName) params.set("name", input.displayName);
  if (input.shuffle) params.set("shuffle", "1");
  return `${PROTOCOL}play/radio?${params}`;
}

/**
 * Sync to a user's now-playing on a scrobble service (PR #755).
 * Parachord polls their listens and plays the same track in lock-step.
 * Service defaults to listenbrainz since that's the only scrobble
 * surface Achordion currently surfaces.
 */
export function parachordListenAlong(input: {
  user: string;
  service?: "listenbrainz" | "lastfm";
}): string {
  const params = new URLSearchParams({
    service: input.service ?? "listenbrainz",
    user: input.user,
  });
  return `${PROTOCOL}listen-along?${params}`;
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

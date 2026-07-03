/**
 * Derive the "streamed-from" source link for a ListenBrainz listen.
 *
 * Parachord ≥ v0.9.4 enriches each scrobble's `additional_info` with
 * the source it actually played from (`origin_url` + canonical
 * `music_service` host + human `music_service_name`), plus a
 * `spotify_id` canonical URL even for non-Spotify plays. This pulls a
 * single usable source out of that, for two consumers:
 *
 *   - as an Odesli `seedUrl` to `/api/track-links`, so a track resolves
 *     to cross-platform links even when MusicBrainz has no url-rel
 *     (closes the bulk of the "played but no links" gap); and
 *   - as a direct "Listen on {service}" affordance on listen rows.
 *
 * Pure + dependency-free so it can be unit-tested without the LB
 * client. Returns null when there's no usable http(s) source — e.g.
 * localfiles plays, whose `origin_url` is a non-shareable `file://`.
 */

export interface ListenSource {
  /** The streamed-from URL (origin_url preferred, spotify_id fallback). */
  url: string;
  /** Human label, e.g. "Spotify". */
  serviceName: string;
  /** Canonical hostname for favicon lookup, e.g. "spotify.com". */
  serviceHost: string;
}

interface SourceFields {
  origin_url?: string | null;
  spotify_id?: string | null;
  music_service?: string;
  music_service_name?: string;
}

const SERVICE_NAMES: Record<string, string> = {
  "spotify.com": "Spotify",
  "open.spotify.com": "Spotify",
  "music.apple.com": "Apple Music",
  "bandcamp.com": "Bandcamp",
  "soundcloud.com": "SoundCloud",
  "youtube.com": "YouTube",
  "music.youtube.com": "YouTube Music",
  "tidal.com": "Tidal",
  "deezer.com": "Deezer",
};

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Reduce a derived host to its registrable domain so streaming
// subdomains collapse to the canonical service host
// (open.spotify.com → spotify.com, artist.bandcamp.com → bandcamp.com).
// Streaming services are all single-label .com TLDs, so last-two-labels
// is sufficient. Only applied to URL-derived hosts; Parachord's own
// `music_service` value is already canonical and trusted as-is.
function registrableHost(host: string): string {
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : host;
}

function prettyFromHost(host: string): string {
  const parts = host.split(".");
  const sld = parts.length >= 2 ? parts[parts.length - 2] : host;
  return sld.length > 0 ? sld[0].toUpperCase() + sld.slice(1) : host;
}

export function deriveListenSource(
  ai: SourceFields | null | undefined,
): ListenSource | null {
  if (!ai) return null;
  // origin_url = what actually played; spotify_id = canonical Spotify
  // URL that may exist even when the play came from elsewhere or a
  // local file. Prefer the real played source.
  const url = [ai.origin_url, ai.spotify_id].find(
    (u): u is string => typeof u === "string" && isHttpUrl(u),
  );
  if (!url) return null;

  // Trust Parachord's canonical host when present; otherwise derive it
  // from the URL and reduce streaming subdomains to the service host.
  const ms = ai.music_service?.trim().toLowerCase().replace(/^www\./, "");
  const derived = hostOf(url);
  const serviceHost = ms || (derived ? registrableHost(derived) : null);
  if (!serviceHost) return null;

  const serviceName =
    ai.music_service_name?.trim() ||
    SERVICE_NAMES[serviceHost] ||
    prettyFromHost(serviceHost);

  return { url, serviceName, serviceHost };
}

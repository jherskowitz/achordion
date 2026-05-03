/**
 * Centralised hrefs for the three entity lookup routes.
 *
 * Direct links require an MBID. When all you have is a name (chart
 * rows, scrobble fallbacks where MBID resolution didn't run), use the
 * lookup-route variants — they search MusicBrainz at click time and
 * redirect to the canonical entity page (or /search on no match).
 *
 *   artist:        /artist/<mbid>                              (direct)
 *                  /artist/lookup?name=<encoded>               (by name)
 *
 *   release-group: /release-group/<mbid>                       (direct)
 *                  /release-group/lookup?artist=&title=        (by names)
 *
 *   recording:     /recording/<mbid>                           (direct)
 *                  /recording/lookup?artist=&title=            (by names)
 *
 * Helpers prefer direct links when an MBID is supplied; fall through
 * to the lookup variant otherwise. They never return null — every
 * (artist | album | track) line in the app should be clickable.
 */

export function artistHref(opts: {
  mbid?: string | null;
  name: string;
}): string {
  if (opts.mbid) return `/artist/${opts.mbid}`;
  return `/artist/lookup?name=${encodeURIComponent(opts.name)}`;
}

export function releaseGroupHref(opts: {
  mbid?: string | null;
  artist: string;
  title: string;
}): string {
  if (opts.mbid) return `/release-group/${opts.mbid}`;
  const params = new URLSearchParams({
    artist: opts.artist,
    title: opts.title,
  });
  return `/release-group/lookup?${params}`;
}

export function recordingHref(opts: {
  mbid?: string | null;
  artist: string;
  title: string;
}): string {
  if (opts.mbid) return `/recording/${opts.mbid}`;
  const params = new URLSearchParams({
    artist: opts.artist,
    title: opts.title,
  });
  return `/recording/lookup?${params}`;
}

/**
 * Predictable URL for a Spinbin station logo. Used by the Radio
 * Rewind grid which doesn't fetch the per-station XSPF (and so can't
 * read the playlist-level `<image>` element). When a logo lands at
 * the predicted URL the grid picks it up automatically; when it
 * doesn't (404) `<StationCover>`'s onError swap restores the
 * brand-colour tile fallback.
 *
 * Detail-page consumers should use `playlist.image` from the parsed
 * XSPF instead — that's authoritative when present.
 */
export function stationLogoUrl(id: string): string {
  return `https://jherskowitz.github.io/spinbin/logos/${encodeURIComponent(id)}.svg`;
}

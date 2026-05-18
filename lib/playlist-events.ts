import "server-only";

import { getPlaylistPublishedEventsForOwners } from "@/lib/playlist-published-index";
import { isFeatureEnabled } from "@/lib/flags";
import { getPlaylist } from "@/lib/clients/listenbrainz";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

/**
 * Synthetic feed event for "user X just made a playlist public."
 * Mirrors the shape of `loved_recording`, `mention`,
 * `bsky_friend_linked`, and `listen_along` so `<FeedEventList>` can
 * dispatch on `event_type` like the others.
 *
 * Recorded server-side when the playlist owner flips a playlist
 * from private → public via `setPlaylistVisibilityAction` or
 * `editPlaylistAction`. No LB-side broadcast — LB doesn't emit a
 * timeline event for this transition, so the feed is the only
 * surface where followers see it on Achordion.
 *
 * Privacy gate at read time: if the playlist has been flipped back
 * to private between record and render, the event is filtered out
 * so a follower can't click a now-404'ing link. Cost is one
 * `getPlaylist` per visible event — cached at the LB-client layer.
 */
export const PLAYLIST_PUBLISHED_EVENT_TYPE = "playlist_published";

export interface PlaylistPublishedEventMeta {
  /** LB playlist MBID. */
  mbid: string;
  /** Owner's LB username. */
  owner: string;
  /** Title at publish time. The renderer prefers this for the
   *  headline; navigation always targets the live playlist URL so a
   *  rename after publish doesn't surface stale state on click. */
  title: string;
}

/**
 * Pull playlist-published events from `following` (people the viewer
 * follows) newer than `since`. Returns LB-shape `FeedEvent[]` so the
 * feed page can merge with native events on the same sort key.
 *
 * Filters out events whose playlist is no longer public (or is
 * deleted) at render time — followers shouldn't be teased with a
 * link that 404s when they click it.
 *
 * `following` is provided by the caller (the feed page already
 * resolves it once and shares across all synthetic-event readers).
 */
export async function getPlaylistPublishedEvents(
  viewer: string,
  following: string[],
  sinceUnix: number | null,
): Promise<FeedEvent[]> {
  if (!viewer) return [];
  if (!(await isFeatureEnabled("playlist-published-events", viewer))) return [];
  const owners = following.filter(
    (u) => u && u.toLowerCase() !== viewer.toLowerCase(),
  );
  if (owners.length === 0) return [];
  const since = sinceUnix ?? 0;
  const raw = await getPlaylistPublishedEventsForOwners(owners, since);
  if (raw.length === 0) return [];

  // Re-check each playlist's visibility — privacy gate. If the
  // owner flipped a playlist back to private after we recorded the
  // event, drop it from the rendered feed. `getPlaylist` caches
  // at the LB-client layer, so the per-event cost is negligible
  // in steady state.
  const visibleChecks = await Promise.all(
    raw.map(async (e) => {
      try {
        const detail = await getPlaylist(e.mbid);
        if (!detail || !detail.isPublic) return null;
        return e;
      } catch {
        return null;
      }
    }),
  );
  const visible = visibleChecks.filter(
    (e): e is (typeof raw)[number] => e !== null,
  );

  return visible.map((e) => ({
    event_type: PLAYLIST_PUBLISHED_EVENT_TYPE,
    created: e.created,
    user_name: e.owner,
    // Synthetic id — same hashing pattern used by listen-along
    // events. Keeps the React key stable across re-renders.
    id: hashEventKey(e.owner, e.mbid, e.created),
    metadata: {
      mbid: e.mbid,
      owner: e.owner,
      title: e.title,
    } satisfies PlaylistPublishedEventMeta,
  }));
}

function hashEventKey(owner: string, mbid: string, created: number): number {
  const s = `${owner.toLowerCase()}|${mbid.toLowerCase()}|${created}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import type { Listen } from "@/lib/clients/listenbrainz";
import { ScrobbleList } from "./scrobble-list";
import { TrackActionsMenu, type TrackRef } from "./track-actions-menu";

/**
 * Static list-of-listens with per-row overflow menus for the signed-
 * in viewer. Mirrors the trailing-menu logic in `<LiveScrobbleList>`
 * but skips the polling timer — used on `/user/<name>/listens` where
 * the page is paginated via `?before=<ts>` and replacing the list
 * mid-page would clobber that state.
 *
 * `useSession()` lives here (not in the parent) so the parent route
 * can stay edge-cacheable. Server-side `auth()` would dynamic-render
 * every variant; resolving the viewer client-side keeps the SSR
 * output identical for every visitor.
 *
 * Optimistic deletion mirrors LiveScrobbleList: the row pops out
 * locally and a navigation / refresh reconciles with LB.
 */
export function ScrobbleListWithActions({
  username,
  initialListens,
}: {
  username: string;
  initialListens: Listen[];
}) {
  const [listens, setListens] = useState<Listen[]>(initialListens);

  const { data: session } = useSession();
  const viewerName = session?.user?.mbUsername;
  const viewer = viewerName ? { mbUsername: viewerName } : null;

  return (
    <ScrobbleList
      listens={listens}
      renderTrailing={(listen) => {
        if (!viewer) return null;
        const meta = listen.track_metadata;
        const recordingMbid =
          meta.mbid_mapping?.recording_mbid ??
          meta.additional_info?.recording_mbid ??
          null;
        const additional = meta.additional_info as
          | (Record<string, unknown> & { recording_msid?: string })
          | undefined;
        const recordingMsid =
          typeof additional?.recording_msid === "string"
            ? additional.recording_msid
            : null;
        const releaseMbid =
          meta.mbid_mapping?.release_mbid ??
          meta.additional_info?.release_mbid ??
          null;
        const trackRef: TrackRef = {
          recordingMbid,
          recordingMsid,
          trackName: meta.track_name,
          artistName: meta.artist_name,
          releaseMbid,
          listenedAt: listen.listened_at,
          ownerUsername: username,
        };
        return (
          <TrackActionsMenu
            track={trackRef}
            viewer={viewer}
            onDeleted={() => {
              // Optimistic drop. Without polling here, reconciliation
              // happens on next navigation / refresh.
              setListens((prev) =>
                prev.filter(
                  (l) =>
                    !(
                      l.listened_at === listen.listened_at &&
                      (l.track_metadata.additional_info as
                        | { recording_msid?: string }
                        | undefined)?.recording_msid === recordingMsid
                    ),
                ),
              );
            }}
          />
        );
      }}
    />
  );
}

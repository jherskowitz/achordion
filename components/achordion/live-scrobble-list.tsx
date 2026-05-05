"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Listen } from "@/lib/clients/listenbrainz";
import { ScrobbleList } from "./scrobble-list";
import { TrackActionsMenu, type TrackRef } from "./track-actions-menu";

const POLL_INTERVAL_MS = 25_000;

/**
 * Recent listens that auto-update as new scrobbles arrive. Initial
 * render uses the server-fetched data so there's no flash; thereafter
 * we poll the route handler at ~25s and swap the list when the newest
 * `listened_at` changes.
 *
 * Polling pauses when the document is hidden — no point fetching for a
 * background tab. We re-fetch immediately on visibility-return so the
 * user sees current state when they switch back.
 *
 * For signed-in viewers we also slot a `<TrackActionsMenu>` (⋮) into
 * each row's right edge. We use `useSession()` rather than threading
 * a `viewer` prop from the server so the parent page (`/user/[name]`)
 * can stay edge-cacheable — calling `auth()` server-side would
 * dynamic-render every variant.
 */
export function LiveScrobbleList({
  username,
  initialListens,
}: {
  username: string;
  initialListens: Listen[];
}) {
  const [listens, setListens] = useState<Listen[]>(initialListens);
  const latestTsRef = useRef<number | null>(initialListens[0]?.listened_at ?? null);

  const { data: session } = useSession();
  const viewerName = session?.user?.mbUsername;
  const viewer = viewerName ? { mbUsername: viewerName } : null;

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(
          `/api/user/${encodeURIComponent(username)}/recent-listens`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          listens: Listen[];
          latestTs: number | null;
        };
        if (cancelled) return;
        if (data.latestTs !== latestTsRef.current) {
          latestTsRef.current = data.latestTs;
          setListens(data.listens);
        }
      } catch {
        // Network blip — try again next tick.
      }
    }

    function start() {
      // Small initial offset so we don't double-fetch right after the
      // server-rendered page hydrates.
      timer = window.setInterval(poll, POLL_INTERVAL_MS);
    }
    function stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        // Catch-up fetch on tab refocus, then resume polling.
        void poll();
        if (timer === null) start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [username]);

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
        // `recording_msid` lives in additional_info via passthrough,
        // so it isn't on the typed surface — pull it through `unknown`.
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
              // Optimistically drop the row. The next poll tick (or a
              // navigation that triggers `revalidateTag`) will reconcile.
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

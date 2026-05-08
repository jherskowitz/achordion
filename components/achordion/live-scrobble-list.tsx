"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Listen } from "@/lib/clients/listenbrainz";
import { ScrobbleList } from "./scrobble-list";
import { TrackActionsMenu, type TrackRef } from "./track-actions-menu";

// Tightened from 25s → 15s. ListenBrainz ingestion adds ~10-20s of
// its own lag between scrobble submission and the listen being
// queryable via /user/<name>/listens, so the perceived freshness is
// roughly poll-interval + LB-lag. 15s keeps the visible delay under
// ~30s most of the time without piling on requests.
const POLL_INTERVAL_MS = 15_000;
/** Floor on extra polls fired by user interaction (focus,
 *  pointerdown, keydown) — keeps a click-heavy session from
 *  hammering /api/user/<name>/recent-listens. */
const INTERACTION_POLL_COOLDOWN_MS = 8_000;

/**
 * Recent listens that auto-update as new scrobbles arrive. Initial
 * render uses the server-fetched data so there's no flash; thereafter
 * we poll the route handler and swap the list when the newest
 * `listened_at` changes.
 *
 * Update strategy:
 *   - Immediate poll on mount so users who hit the page after a fresh
 *     scrobble don't sit on stale SSR for a full interval.
 *   - 15s background timer (paused while the document is hidden).
 *   - Interaction-driven catch-up polls on focus / pointerdown /
 *     keydown when the last fetch is older than the cooldown — the
 *     user touching the page is a strong signal to surface what's
 *     current.
 *   - Re-fetch on visibilitychange when the tab comes back.
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
    // Timestamp of the last poll fire. Lets the interaction handler
    // decide whether an extra fetch is worth it (vs. a noisy click
    // burst right after a scheduled tick).
    let lastPollAt = 0;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      lastPollAt = Date.now();
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
    // Cheap "user is back" signal: focus / pointer / key activity
    // after a quiet stretch fires one extra poll so freshly-arrived
    // listens surface without waiting for the next interval. Cooldown
    // keeps a click-heavy session from hammering the route.
    function onInteraction() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastPollAt < INTERACTION_POLL_COOLDOWN_MS) return;
      void poll();
    }

    // Fire once on mount — bridges the gap between SSR (which may be
    // edge-cached for up to an hour) and the first scheduled tick.
    void poll();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onInteraction);
    document.addEventListener("pointerdown", onInteraction, { passive: true });
    document.addEventListener("keydown", onInteraction);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onInteraction);
      document.removeEventListener("pointerdown", onInteraction);
      document.removeEventListener("keydown", onInteraction);
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

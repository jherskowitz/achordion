"use client";

import { useEffect, useRef, useState } from "react";
import type { Listen } from "@/lib/clients/listenbrainz";
import { ScrobbleList } from "./scrobble-list";

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

  return <ScrobbleList listens={listens} />;
}

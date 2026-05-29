"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronUp } from "lucide-react";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

/**
 * Client island wrapper for the server-rendered feed.
 *
 * Wraps the existing `<FeedEventList>` (an async server component
 * that pre-resolves CritiqueBrainz review covers / artist credits
 * etc.) and adds:
 *
 *   1. **Background polling.** Every POLL_INTERVAL_MS the island
 *      hits `/api/me/feed?since=<latest_created>` with the same
 *      `excludeSelf` flag the page was rendered with. Paused when
 *      `document.hidden`, resumed on visibility-change and on
 *      window-focus interaction so a backgrounded tab doesn't burn
 *      LB calls.
 *
 *   2. **"N new events" sticky chip.** When a poll returns one or
 *      more events newer than the current ceiling, a small chip
 *      slides in at the top of the list. Click → `router.refresh()`
 *      so the server re-renders `FeedBody` (which re-runs
 *      `resolveReviewEntities` etc.) with the new events spliced in,
 *      then smooth-scrolls back to the top.
 *
 * Why a refresh rather than an inline prepend: `<FeedEventList>` is
 * server-rendered and pre-resolves cover-art URLs + artist credit
 * lines via MB / LB metadata batches. Doing the same resolution
 * client-side would duplicate ~150 lines of logic and N async
 * round-trips per new event. A single `router.refresh()` lets the
 * existing server render do its job once, with the freshest data,
 * for the cost of one RSC round-trip.
 */

/** Poll cadence. 60s is dense enough for "X just pinned a track to
 *  appear within a minute" without becoming a heartbeat that
 *  spam-keeps the per-IP rate limit warm. */
const POLL_INTERVAL_MS = 60_000;

interface FeedStreamResponse {
  events: FeedEvent[];
  error: "no-token" | "lb-down" | null;
}

interface FeedStreamProps {
  /** The viewer's LB username, used as the React Query cache key so
   *  signing out + back in as someone else doesn't show the prior
   *  user's "N new" chip from a stale cache. */
  viewerName: string;
  /** Mirror of the page's `?source=others` filter so the polling
   *  query gates server-side dedupe the same way the page render
   *  does. Without this we'd surface "N new" for the viewer's own
   *  loves / pins even when the page is in others-only mode. */
  excludeSelf: boolean;
  /** Newest `created` timestamp in the server-rendered initial set.
   *  Polls only ask for events `> latestCreated`, so the response's
   *  `events.length` IS the unread count to surface on the chip. */
  latestCreated: number;
  /** The server-rendered `<FeedEventList>` (passed as a slot so the
   *  client island doesn't try to mount a server component). */
  children: ReactNode;
}

export function FeedStream({
  viewerName,
  excludeSelf,
  latestCreated,
  children,
}: FeedStreamProps) {
  const router = useRouter();
  const [tabVisible, setTabVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true,
  );

  // Track the "ceiling" timestamp we've already either rendered or
  // dismissed via refresh. Without it, the chip's "N new" count
  // would re-flash after every refresh because the polling result
  // still includes the events we just rendered (the response is
  // strictly > ceiling).
  const ceilingRef = useRef(latestCreated);
  // Re-sync the ceiling when the parent SSR's latestCreated changes
  // (e.g. after `router.refresh()` brings in newer events). Effect
  // runs after the next render so the chip stays visible during
  // the React transition that swaps the children in.
  useEffect(() => {
    ceilingRef.current = Math.max(ceilingRef.current, latestCreated);
  }, [latestCreated]);

  useEffect(() => {
    function onVis() {
      setTabVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  const { data } = useQuery<FeedStreamResponse>({
    queryKey: ["me-feed", viewerName, excludeSelf],
    queryFn: async () => {
      const params = new URLSearchParams({
        since: String(ceilingRef.current),
      });
      if (excludeSelf) params.set("excludeSelf", "1");
      const r = await fetch(`/api/me/feed?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!r.ok) {
        throw new Error(`feed poll failed: ${r.status}`);
      }
      return (await r.json()) as FeedStreamResponse;
    },
    enabled: tabVisible,
    refetchInterval: tabVisible ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const newCount = data?.events.length ?? 0;

  async function refresh() {
    // `router.refresh()` re-runs FeedBody on the server, which calls
    // `mergeFeedEvents` again. The next render's `latestCreated`
    // prop will be the freshest event's timestamp; the effect above
    // bumps the ceiling so the chip clears.
    router.refresh();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="relative">
      {newCount > 0 && (
        // Sticky inside the page scroll so the chip stays anchored
        // near the top of the list as the user scrolls down through
        // older content. z-10 keeps it above the EventShell's icon
        // tile (z-0 by default).
        <div className="sticky top-2 z-10 mb-3 flex justify-center">
          <button
            type="button"
            onClick={refresh}
            aria-live="polite"
            className="bg-primary text-primary-foreground inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-sm transition-opacity hover:opacity-90"
          >
            <ChevronUp className="size-3.5" />
            {newCount === 1
              ? "1 new event"
              : `${newCount.toLocaleString()} new events`}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

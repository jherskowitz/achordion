"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Fire-and-forget POST that bumps the viewer's `feed_seen_ts` cookie
 * to "now" so the unread badge resets after a feed visit. Mounted on
 * the /feed page; idempotent.
 */
export function MarkFeedSeen() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/mark-feed-seen", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        // Drop the unread-count query so the next nav render fetches
        // fresh and shows zero.
        queryClient.invalidateQueries({ queryKey: ["me", "feed-unread"] });
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);
  return null;
}

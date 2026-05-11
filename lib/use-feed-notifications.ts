"use client";

import { useEffect, useRef } from "react";

/**
 * Browser-notification side-channel for the feed-unread polling loop
 * that already runs in `<SiteHeader>`.
 *
 * Fires a `Notification` when the unread count rises above the
 * previous reading. Gated on three independent conditions, ANDed:
 *
 *   1. User has flipped the opt-in toggle in `/settings`
 *      (`localStorage.achordion.feed-notifications-enabled === "1"`).
 *   2. Browser-level permission is `granted`. Asking for permission
 *      lives on the settings toggle so it never fires on page load.
 *   3. The Achordion tab is currently hidden — no reason to ping
 *      someone who's looking at the site right now.
 *
 * No notification on initial load (we don't know if the count is
 * "fresh" or stale-since-last-visit). Only count *increases* across
 * polls trigger a fire.
 *
 * The notification's click handler focuses the existing tab if one's
 * open and routes to /feed. Multiple notifications collapse via a
 * stable `tag` so a stretch of inactivity doesn't pile up a banner
 * stack.
 */

export const FEED_NOTIFICATIONS_STORAGE_KEY =
  "achordion.feed-notifications-enabled";

function isOptedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FEED_NOTIFICATIONS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useFeedNotifications(unreadCount: number | undefined) {
  // Previous count across renders. Initialised lazily on the first
  // real reading so we don't fire on the boot transition from
  // undefined → N.
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof unreadCount !== "number") return;
    if (typeof window === "undefined") return;

    const prev = prevCountRef.current;
    prevCountRef.current = unreadCount;

    // First reading — record only, never fire.
    if (prev === null) return;
    // No new events since the last poll.
    if (unreadCount <= prev) return;

    if (!isOptedIn()) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState !== "hidden") return;

    const delta = unreadCount - prev;
    const title =
      delta === 1
        ? "New on your Achordion feed"
        : `${delta} new on your Achordion feed`;
    try {
      // `renotify: true` is omitted because it isn't in the current
      // DOM lib types even though browsers honour it; without it the
      // OS still re-surfaces the notification when the body text
      // differs (which it does — the delta count changes), so the
      // user-visible behaviour is the same in practice.
      const n = new Notification(title, {
        body: "Tap to open your feed.",
        // Single-slot tag — if a previous notification is still
        // visible, this one replaces it instead of stacking.
        tag: "achordion-feed-unread",
        // No `icon` — we don't ship a PNG/JPG icon (only icon.svg /
        // favicon.ico), and most browsers won't render SVG in a
        // Notification slot. Leaving icon unset lets the OS fall
        // back to a sensible default (favicon on Chrome, app icon
        // on Safari/Firefox).
      });
      n.onclick = () => {
        // Bring the existing tab forward when possible; either way
        // navigate to /feed.
        window.focus();
        window.location.href = "/feed";
        n.close();
      };
    } catch {
      // Some browsers throw if the page lost notification permission
      // mid-session, or if the constructor is unavailable in private
      // mode. Either way we just want to skip silently.
    }
  }, [unreadCount]);
}

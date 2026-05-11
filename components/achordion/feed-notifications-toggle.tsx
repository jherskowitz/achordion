"use client";

import { useEffect, useState } from "react";
import { FEED_NOTIFICATIONS_STORAGE_KEY } from "@/lib/use-feed-notifications";

/**
 * Opt-in toggle for browser notifications on new feed events.
 *
 * Two layers of consent stacked:
 *   1. Browser permission (`Notification.requestPermission()`) — the
 *      OS-level "this site can post notifications" grant.
 *   2. Achordion preference (localStorage `achordion.feed-
 *      notifications-enabled`) — even with permission granted, no
 *      notifications fire until the user explicitly enables them
 *      here. Lets the user revoke without trekking through browser
 *      settings.
 *
 * Toggle states:
 *   - off / permission-granted-but-pref-off → "Off". One click flips
 *     pref on. If permission isn't granted yet, we prompt first.
 *   - on → "On". One click flips pref off (kills notifications) but
 *     keeps the browser permission untouched.
 *   - permission denied → "Blocked". Toggle disabled; the only path
 *     forward is the browser's site-settings UI, which we link to in
 *     the help text below.
 *   - notifications unavailable (private mode, very old browser,
 *     etc.) → "Unavailable". Disabled.
 *
 * Stored client-side only — there's no Achordion-side state about
 * who's subscribed because nothing on the server cares (Tier 1 is
 * fire-from-the-tab; the server doesn't push).
 */
export function FeedNotificationsToggle() {
  // Lazy-initialise to avoid SSR/hydration mismatch — `Notification`
  // and `localStorage` only exist in the browser.
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // All three setters set client-only values that we deliberately
    // don't render until `mounted` flips — SSR + hydration both show
    // the placeholder. This is the intentional shape, so silencing
    // the `set-state-in-effect` lint here.
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    if (typeof Notification === "undefined") {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    try {
      setEnabled(
        window.localStorage.getItem(FEED_NOTIFICATIONS_STORAGE_KEY) === "1",
      );
    } catch {
      setEnabled(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function toggle() {
    if (!supported) return;
    if (permission === "denied") return;

    if (enabled) {
      // Disable — keep browser permission, just stop firing.
      try {
        window.localStorage.removeItem(FEED_NOTIFICATIONS_STORAGE_KEY);
      } catch {
        // localStorage write failed (private mode, quota, etc.) —
        // pref simply doesn't persist; nothing else to do.
      }
      setEnabled(false);
      return;
    }

    // Enable — request permission if we don't have it yet, then flip
    // the local pref. If the user denies the prompt we don't enable.
    // Explicit type so the reassignment to `"denied"` /
    // `requestPermission()` result doesn't trip the narrowing TS
    // applied via the early-return above.
    let perm: NotificationPermission = permission;
    if (perm === "default") {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = "denied";
      }
      setPermission(perm);
    }
    if (perm !== "granted") return;
    try {
      window.localStorage.setItem(FEED_NOTIFICATIONS_STORAGE_KEY, "1");
    } catch {
      // Same as above — non-fatal. The toggle still flips for this
      // session; it just won't persist across reloads.
    }
    setEnabled(true);
  }

  // SSR-stable placeholder until the client effect runs.
  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className="border-border/60 inline-flex h-9 items-center rounded-lg border px-4 text-sm opacity-50"
      >
        Loading…
      </button>
    );
  }

  if (!supported) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          disabled
          className="border-border/60 inline-flex h-9 items-center rounded-lg border px-4 text-sm opacity-50"
        >
          Unavailable
        </button>
        <p className="text-muted-foreground/80 text-xs leading-5">
          Your browser doesn&apos;t support notifications.
        </p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          disabled
          className="border-border/60 inline-flex h-9 items-center rounded-lg border px-4 text-sm opacity-50"
        >
          Blocked
        </button>
        <p className="text-muted-foreground/80 text-xs leading-5">
          You&apos;ve blocked notifications for this site. Re-enable
          via the lock icon next to the URL in your browser, then
          come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={toggle}
        className={
          enabled
            ? "border-primary bg-primary/10 text-foreground inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium"
            : "border-border/60 hover:bg-muted/40 inline-flex h-9 items-center rounded-lg border px-4 text-sm"
        }
      >
        {enabled ? "On" : "Off"}
      </button>
      <p className="text-muted-foreground/80 text-xs leading-5">
        Only fires while an Achordion tab is open in your browser.
        Close every tab and notifications stop. (Achordion is
        stateless on the server, so there&apos;s nothing to push
        when no tab is around to listen.)
      </p>
    </div>
  );
}

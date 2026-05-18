"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useParachordPresence } from "@/lib/use-parachord-presence";

/**
 * Wrapper for the "Listen along" anchor that fires the synthetic-
 * event beacon on click when Parachord is confirmed connected.
 *
 * Why a shared component: three different surfaces render the
 * Listen along affordance — `<LiveOnAirIndicator>` (polling, profile
 * headers + site header), `<OnAirIndicator>` (server-rendered, user
 * cards in lists), and `<NowPlayingPill>` (compact pill, more list
 * surfaces). All three need to fire the beacon, but they differ in
 * tooltip wrappers, sizing, and icon-only vs labeled rendering.
 * Hoisting the hook + beacon into one client component keeps the
 * three call sites identical at the wiring level — only their
 * presentation differs (passed via `className` + `children`).
 *
 * The beacon never blocks the click — failure of the recording
 * route never affects the user-visible action (Parachord opens
 * regardless). Falls back to a no-keepalive fetch if `sendBeacon`
 * is unavailable.
 *
 * Server-rendered consumers (`<OnAirIndicator>`) can mount this as
 * an island — Next.js handles the boundary, and the `<a>` rendered
 * here lays out the same as a raw anchor at the SSR seam.
 */
export function ListenAlongLink({
  target,
  href,
  children,
  ...anchorProps
}: {
  /** LB username being listened along with — what the beacon records
   *  as the click's target. */
  target: string;
  href: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">) {
  const connected = useParachordPresence();
  return (
    <a
      {...anchorProps}
      href={href}
      onClick={
        connected
          ? (e) => {
              recordListenAlongEvent(target);
              anchorProps.onClick?.(e);
            }
          : anchorProps.onClick
      }
    >
      {children}
    </a>
  );
}

/**
 * Fire-and-forget POST to `/api/listen-along/event`. `sendBeacon`
 * is the right primitive — it survives the page-unload that the
 * `parachord://` navigation triggers. Falls back to keepalive
 * fetch when `sendBeacon` isn't available.
 */
function recordListenAlongEvent(target: string): void {
  if (typeof navigator === "undefined") return;
  const body = JSON.stringify({ target });
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/listen-along/event", blob);
      return;
    }
    void fetch("/api/listen-along/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // sendBeacon throws synchronously in some quota-exhaustion
    // states; fall back silently — the click navigation already
    // fired and the user's primary action is unaffected.
  }
}

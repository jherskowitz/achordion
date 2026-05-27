"use client";

import { useEffect } from "react";
import { preferredParachordHref } from "@/lib/use-parachord-presence";

/**
 * Document-level click listener that rewrites
 * `https://parachord.com/<verb>` anchor clicks into the
 * `parachord://<verb>` custom scheme when the desktop Parachord app
 * is confirmed running locally.
 *
 * Why a single global listener instead of per-component handlers:
 * Parachord URLs are emitted from ~30 different components (every
 * Play button, hover-fab, Open-in-Parachord pill, listen-along
 * link, feed-event row, etc.), and many of them are server-rendered
 * — they can't call `useParachordPresence` to gate the rewrite at
 * href-build time. Hoisting the rewrite into a single browser-side
 * capture handler keeps the render side unchanged: server components
 * emit the canonical HTTPS form, and the page transparently routes
 * straight into the desktop app at click time when possible.
 *
 * Behaviour matrix:
 *   - Desktop, WS confirmed → preventDefault + navigate to
 *     `parachord://`. No browser tab is opened, no parachord.com
 *     page-load round-trip. The user clicked Play; the app plays.
 *   - Desktop, WS not confirmed → default browser navigation to
 *     the HTTPS URL. Lands on parachord.com's fallback page where
 *     the user can install / launch the app.
 *   - Mobile (coarse pointer) → default browser navigation. The OS
 *     routes verified App Links / Universal Links straight to the
 *     installed app; non-installed users get the fallback page.
 *
 * Middle-click / Cmd-click / right-click "Open in new tab" all keep
 * working — they navigate to the HTTPS form (preserves the right
 * shape for "open this on parachord.com in a new tab"), the anchor's
 * `href` attribute is unchanged, and Copy Link Address yields the
 * HTTPS URL too (the right form to share with someone else).
 */
export function ParachordLinkRewriter() {
  useEffect(() => {
    function handler(event: MouseEvent) {
      // Only rewrite plain left-clicks. Middle / aux / modified
      // clicks all keep default behaviour so "open in new tab" and
      // friends route through the parachord.com fallback page.
      if (event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }
      // Find the nearest anchor ancestor — clicks often originate
      // on inner spans / icons.
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("https://parachord.com/")) return;
      // Honor explicit target="_blank" so a developer that
      // intentionally wanted a new tab still gets one.
      if (anchor.target === "_blank") return;
      const preferred = preferredParachordHref(href);
      // If the singleton's source isn't desktop-ws right now,
      // preferredParachordHref returns the input unchanged — bail
      // out so the browser handles navigation normally.
      if (preferred === href) return;
      event.preventDefault();
      // Use location.assign so the page doesn't navigate away on
      // failure — clicking the custom scheme either opens the app
      // (page stays put) or no-ops (page stays put). Either way the
      // user remains on the current Achordion view, which is what
      // we want.
      window.location.assign(preferred);
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return null;
}

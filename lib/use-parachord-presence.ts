"use client";

import { useEffect, useState } from "react";

/**
 * Detect whether the Parachord desktop app is running on the user's
 * machine by opening a WebSocket to its localhost listener.
 *
 * Source-of-truth contract (matches go.parachord.com smart-link pages,
 * see parachord-desktop/smart-links/lib/html.js):
 *
 *   - Desktop app exposes `ws://127.0.0.1:9876`
 *   - Connection open → app is running
 *   - Connection close / error → app is not running; retry on a
 *     backoff so we eventually pick up the app starting up later
 *
 * Implementation note: many components on a single page can call this
 * hook (every Play button, every hover-fab, etc.). Naively each hook
 * instance would open its own WebSocket, which on a 50-card grid
 * means 50 WS attempts every retry tick — pure console spam and
 * needless network churn. Instead we share one connection across all
 * subscribers via a module-level singleton; any component that calls
 * the hook gets pushed the same `running` state.
 */

type Listener = (running: boolean) => void;

const WS_URL = "ws://127.0.0.1:9876";

/** Retry schedule in ms — short at first so a freshly-launched
 *  Parachord is picked up quickly, then backs off so an idle session
 *  doesn't spam the console. Final value caps the back-off. */
const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];

let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let currentRunning = false;
const listeners = new Set<Listener>();

function notify(running: boolean) {
  if (running === currentRunning) return;
  currentRunning = running;
  for (const fn of listeners) fn(running);
}

function nextDelay(): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

function connect() {
  // Don't reconnect if there are no live listeners — fully idle.
  if (listeners.size === 0) return;
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    schedule();
    return;
  }
  socket.onopen = () => {
    attempts = 0;
    notify(true);
  };
  socket.onerror = () => {
    // onclose runs after onerror; let it handle the retry / state.
    socket?.close();
  };
  socket.onclose = () => {
    notify(false);
    socket = null;
    schedule();
  };
}

function schedule() {
  if (retry) clearTimeout(retry);
  if (listeners.size === 0) return;
  attempts++;
  retry = setTimeout(connect, nextDelay());
}

function teardownIfIdle() {
  if (listeners.size > 0) return;
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  if (socket) {
    socket.onopen = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  attempts = 0;
}

/**
 * Detect whether the running environment can't reach the desktop
 * Parachord app via the localhost WebSocket — touch devices, mostly.
 * Phones don't run a Parachord listener on 127.0.0.1 (Parachord-mobile
 * is a sandboxed app), and iOS / Safari additionally block ws://
 * connections to localhost from web pages. So the WS detection always
 * reads `false` on those clients regardless of whether the user
 * actually has Parachord-mobile installed.
 *
 * Heuristic: `(pointer: coarse)` matches devices whose primary input
 * is touch — phones and most tablets. We treat those as
 * "Parachord-assumed-installed" and route taps to the parachord://
 * URL. The OS handles both branches: app installed → opens; not
 * installed → OS shows its own install / fallback prompt (Universal
 * Links can route to a fallback web URL when wired up properly on
 * the Parachord side).
 */
function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

/**
 * Returns true when Parachord's desktop app is reachable, OR when the
 * client is a touch device where we optimistically assume Parachord-
 * mobile is installed (see `isCoarsePointer`). The first client
 * render returns `false` deterministically so SSR and hydration
 * agree; the value flips once the WebSocket opens (desktop) or once
 * the post-mount media-query check confirms a coarse pointer (touch).
 *
 * For URL emission (deciding whether to use the parachord:// custom
 * scheme or the https://parachord.com Universal Link), see
 * `useParachordPreferredHref` below — it draws the distinction the
 * collapsed boolean here intentionally hides.
 */
export function useParachordPresence(): boolean {
  return useParachordPresenceSource() !== null;
}

/**
 * Same singleton as `useParachordPresence`, but exposes *why* we
 * think Parachord is present:
 *
 *   - `"desktop-ws"` — the localhost WS handshake completed; we can
 *     deep-link via `parachord://` and the OS will route to the
 *     running app without opening a browser tab.
 *   - `"mobile-assumed"` — coarse-pointer device; we don't know for
 *     sure whether Parachord-mobile is installed, but the universal
 *     `https://parachord.com/<verb>` URL handles both cases (app
 *     installed → OS routes via App Link / Universal Link; not
 *     installed → browser lands on the fallback pitch page).
 *   - `null` — neither signal fired; we should still emit the HTTPS
 *     URL so the user gets a useful page rather than a dead click.
 *
 * Same singleton + same subscription as `useParachordPresence`, just
 * a richer return shape for callers that want to distinguish the
 * two cases.
 */
export type ParachordPresenceSource = "desktop-ws" | "mobile-assumed";

export function useParachordPresenceSource(): ParachordPresenceSource | null {
  const [source, setSource] = useState<ParachordPresenceSource | null>(null);

  // Subscribes to an external (WebSocket) presence singleton — the
  // canonical "sync to external store" shape that the lint rule
  // flags conservatively because the touch fast-path also calls
  // setState synchronously inside the effect.
  useEffect(() => {
    // Touch fast-path: skip the WS handshake entirely. Parachord-
    // mobile doesn't expose a localhost listener, so the WS would
    // always close and we'd render the muted "Get Parachord" state
    // for users who probably do have the app. Trust the OS to deal
    // with the deep-link instead.
    if (isCoarsePointer()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource("mobile-assumed");
      return;
    }

    const adapter: Listener = (running) =>
      setSource(running ? "desktop-ws" : null);
    listeners.add(adapter);
    // Sync the new subscriber to whatever the singleton already
    // knows so they don't get a stale `false` after the connection
    // already opened for an earlier component.
    setSource(currentRunning ? "desktop-ws" : null);
    // Kick off a connection if this is the first subscriber.
    if (listeners.size === 1 && !socket && !retry) connect();

    return () => {
      listeners.delete(adapter);
      teardownIfIdle();
    };
  }, []);

  return source;
}

/**
 * Returns the URL a play-surface anchor should actually navigate to,
 * given the canonical HTTPS form emitted by `lib/parachord.ts`.
 *
 *   - **Desktop WS confirmed** → rewrite `https://parachord.com/<verb>`
 *     to `parachord://<verb>`. The desktop app's protocol handler
 *     takes the click directly, with no browser tab opened and no
 *     parachord.com page-load round-trip. This is the case the
 *     "Play in Parachord" button is gated on anyway, so when the
 *     button shows up at all, the rewrite happens.
 *   - **Mobile (coarse pointer) or unknown** → return the HTTPS URL
 *     unchanged. The OS routes installed-app users via the verified
 *     App Link / Universal Link; non-installed users land on the
 *     parachord.com fallback page with the destination context
 *     preserved (better than an OS-level "Cannot Open Page" alert).
 *
 * Use this for any anchor whose href is built by `lib/parachord.ts`.
 * The rewrite is a string operation (no React state in the link
 * itself), so middle-click / right-click "Open in new tab" still
 * gets the rewritten URL — which is the right thing, since the user
 * who can deep-link straight into the app doesn't want a stray
 * parachord.com tab from a stray middle-click either.
 */
export function useParachordPreferredHref(httpsUrl: string): string {
  const source = useParachordPresenceSource();
  if (source !== "desktop-ws") return httpsUrl;
  return rewriteToCustomScheme(httpsUrl);
}

/** Eager (non-hook) variant for callers in event handlers / closures
 *  that don't have a hook in scope. Reads the current singleton
 *  state without subscribing. */
export function preferredParachordHref(httpsUrl: string): string {
  if (typeof window === "undefined") return httpsUrl;
  // If the WS singleton is live and the desktop app responded, the
  // custom scheme is the right form. Coarse pointer / unknown both
  // fall through to the HTTPS form.
  if (currentRunning && !isCoarsePointer()) {
    return rewriteToCustomScheme(httpsUrl);
  }
  return httpsUrl;
}

function rewriteToCustomScheme(httpsUrl: string): string {
  // Only rewrite our own host; leave anything else alone so a
  // caller can't accidentally redirect a foreign URL through
  // parachord://.
  return httpsUrl.replace(/^https:\/\/parachord\.com\//, "parachord://");
}

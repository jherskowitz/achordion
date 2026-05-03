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
 * Returns true when Parachord's desktop app is reachable. The first
 * client render returns `false` deterministically so SSR and
 * hydration agree; the value flips once the WebSocket opens.
 */
export function useParachordPresence(): boolean {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    listeners.add(setRunning);
    // Sync the new subscriber to whatever the singleton already
    // knows so they don't get a stale `false` after the connection
    // already opened for an earlier component.
    setRunning(currentRunning);
    // Kick off a connection if this is the first subscriber.
    if (listeners.size === 1 && !socket && !retry) connect();

    return () => {
      listeners.delete(setRunning);
      teardownIfIdle();
    };
  }, []);

  return running;
}

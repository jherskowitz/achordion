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
 *   - Connection close / error → app is not running; retry every 3s
 *
 * Browsers allow `ws://localhost:*` from https pages under the
 * "potentially trustworthy origin" exception, so this works in
 * production deploys too — no mixed-content block.
 *
 * Returns false on the server and on the first client render to keep
 * SSR markup deterministic; flips to true once the socket opens.
 */
export function useParachordPresence(): boolean {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket("ws://127.0.0.1:9876");
      } catch {
        retry = setTimeout(connect, 3000);
        return;
      }
      ws.onopen = () => {
        if (!cancelled) setRunning(true);
      };
      ws.onclose = () => {
        if (cancelled) return;
        setRunning(false);
        retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        // onclose runs after onerror; let it handle the retry.
        ws?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      if (ws) {
        // Clear handlers so the unmount-triggered close doesn't flip
        // state on an unmounted component.
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, []);

  return running;
}

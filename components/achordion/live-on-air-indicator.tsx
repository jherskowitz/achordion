"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import type { PlayingNowListen } from "@/lib/clients/listenbrainz";
import { parachordListenAlong } from "@/lib/parachord";
import { artistHref, recordingHref } from "@/lib/entity-links";
import { cn } from "@/lib/utils";
import { IconTooltip } from "@/components/ui/icon-tooltip";

const POLL_INTERVAL_MS = 25_000;

interface LiveOnAirIndicatorProps {
  username: string;
  /**
   * Initial server-rendered playing state — null when the user wasn't
   * playing at SSR time. Avoids a flash of "nothing" on hydration when
   * they were already on air.
   */
  initialListen: PlayingNowListen | null;
  /** When true, hide the listen-along action (own profile = loop). */
  hideListenAlong?: boolean;
  /** "compact" — single line under a username. "default" — bigger. */
  size?: "compact" | "default";
  className?: string;
}

/**
 * Polling counterpart to the server-rendered <OnAirIndicator>. Used
 * where the indicator should react to live track changes — currently
 * the user-page-header. List rows still use the static server version
 * so we don't run N polling timers on a single page.
 */
export function LiveOnAirIndicator({
  username,
  initialListen,
  hideListenAlong = false,
  size = "default",
  className,
}: LiveOnAirIndicatorProps) {
  const [listen, setListen] = useState<PlayingNowListen | null>(initialListen);
  const lastTrackKeyRef = useRef<string | null>(
    keyOf(initialListen),
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(
          `/api/user/${encodeURIComponent(username)}/playing-now`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          listen: PlayingNowListen | null;
        };
        if (cancelled) return;
        const newKey = keyOf(data.listen);
        if (newKey !== lastTrackKeyRef.current) {
          lastTrackKeyRef.current = newKey;
          setListen(data.listen);
        }
      } catch {
        // swallow — try again next tick.
      }
    }

    function start() {
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
        void poll();
        if (timer === null) start();
      }
    }

    void poll();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [username]);

  if (!listen) return null;

  const meta = listen.track_metadata;
  const listenAlongHref = parachordListenAlong({
    service: "listenbrainz",
    user: username,
  });
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ??
    meta.additional_info?.recording_mbid;
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];
  const trackLink = recordingHref({
    mbid: recordingMbid,
    artist: meta.artist_name,
    title: meta.track_name,
  });
  const artistLink = artistHref({
    mbid: artistMbid,
    name: meta.artist_name,
  });

  const dot = (
    <span
      className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
      aria-hidden
    />
  );

  const trackText = (
    <OnAirText
      trackName={meta.track_name}
      trackLink={trackLink}
      artistName={meta.artist_name}
      artistLink={artistLink}
      sizeVariant={size}
    />
  );

  if (size === "default") {
    return (
      <div
        className={cn(
          // `flex max-w-full` instead of `inline-flex` so the
          // container is bounded by its parent and the inner
          // overflow-clip actually clips long track / artist names
          // on mobile. The compact variant below already does
          // this — keep them consistent.
          "text-muted-foreground flex max-w-full items-center gap-2 text-xs",
          className,
        )}
      >
        {dot}
        {trackText}
        {!hideListenAlong && (
          <IconTooltip
            label={`Listen along with ${username} in Parachord`}
          >
            <a
              href={listenAlongHref}
              className="bg-primary text-primary-foreground inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-opacity hover:opacity-90"
            >
              <Radio className="size-2.5" />
              Listen along
            </a>
          </IconTooltip>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "text-muted-foreground/90 inline-flex max-w-full items-center gap-1.5 text-[11px]",
        className,
      )}
    >
      {dot}
      {trackText}
      {!hideListenAlong && (
        <IconTooltip label={`Listen along with ${username} in Parachord`}>
          <a
            href={listenAlongHref}
            aria-label={`Listen along with ${username} in Parachord`}
            className="bg-primary/90 text-primary-foreground hover:bg-primary inline-flex size-4 shrink-0 items-center justify-center rounded-full transition-colors"
          >
            <Radio className="size-2.5" />
          </a>
        </IconTooltip>
      )}
    </div>
  );
}

/**
 * Track + artist span. When the rendered text would otherwise be
 * clipped by the container, switches to a marquee that scrolls the
 * full string into view and bounces back, so users on the SiteHeader
 * pill can actually read long titles like "G.O.D. And The Broken Ribs
 * — Jack White" without having to navigate elsewhere.
 *
 * Detection runs via ResizeObserver on both the clip container and
 * the inner content, so it adapts to viewport changes (mobile rotate,
 * sidebar collapse) and to track changes that swap shorter/longer
 * text. When the content fits, no animation runs — short titles stay
 * static.
 */
function OnAirText({
  trackName,
  trackLink,
  artistName,
  artistLink,
  sizeVariant,
}: {
  trackName: string;
  trackLink: string;
  artistName: string;
  artistLink: string;
  sizeVariant: "default" | "compact";
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [shiftPx, setShiftPx] = useState(0);

  useEffect(() => {
    function measure() {
      const c = containerRef.current;
      const i = innerRef.current;
      if (!c || !i) return;
      const overflow = i.scrollWidth - c.clientWidth;
      setShiftPx(overflow > 4 ? -overflow : 0);
    }
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [trackName, artistName]);

  const trackClass =
    sizeVariant === "default"
      ? "text-foreground font-medium hover:underline"
      : "text-foreground/90 hover:underline";

  const animating = shiftPx < 0;

  return (
    <span
      ref={containerRef}
      className="min-w-0 flex-1 overflow-hidden"
    >
      <span
        ref={innerRef}
        className={cn(
          "inline-block whitespace-nowrap",
          animating && "on-air-marquee",
        )}
        style={
          animating
            ? ({ ["--marquee-shift" as string]: `${shiftPx}px` } as CSSProperties)
            : undefined
        }
      >
        <Link href={trackLink} className={trackClass}>
          {trackName}
        </Link>
        <span className="text-muted-foreground"> — </span>
        <Link
          href={artistLink}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          {artistName}
        </Link>
      </span>
    </span>
  );
}

function keyOf(listen: PlayingNowListen | null): string | null {
  if (!listen) return null;
  const m = listen.track_metadata;
  return `${m.track_name}|${m.artist_name}`;
}

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Track + artist span with adaptive marquee.
 *
 * When the rendered "<title> — <artist>" string overflows its
 * container, this component switches the inner `<span>` to a
 * CSS-driven marquee that scrolls the full text into view and
 * bounces back. When the text fits, no animation runs — short
 * titles stay static.
 *
 * Detection runs via ResizeObserver on both the clip container and
 * the inner content, so it adapts to viewport changes (mobile rotate,
 * sidebar collapse) and to track changes that swap shorter / longer
 * text. The CSS keyframes (`on-air-marquee` in globals.css) consume
 * a `--marquee-shift` custom property the JS sets to the negative
 * pixel-overflow.
 *
 * Used by both the server-rendered `<OnAirIndicator>` (rows in
 * lists, no polling) and the client-side `<LiveOnAirIndicator>`
 * (header pill, profile header, where track changes need live
 * updates). Sharing the marquee here keeps long titles readable on
 * narrow sidebars regardless of which variant is in play.
 */
export function OnAirText({
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
    <span ref={containerRef} className="min-w-0 flex-1 overflow-hidden">
      <span
        ref={innerRef}
        className={cn(
          "inline-block whitespace-nowrap",
          animating && "on-air-marquee",
        )}
        style={
          animating
            ? ({
                ["--marquee-shift" as string]: `${shiftPx}px`,
              } as CSSProperties)
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

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand-tile cover used on Radio Rewind cards (and the detail-page
 * hero). Renders the station logo when one is available, falls back
 * to the existing colour-tile-with-name treatment when it isn't (or
 * when the image 404s on load — Spinbin is rolling out logos
 * incrementally per station).
 *
 * Used by:
 *   - <RadioRewindGrid> via the predictable
 *     `https://jherskowitz.github.io/spinbin/logos/{id}.svg` URL, so
 *     logos appear automatically as Spinbin publishes them — no
 *     per-station code change.
 *   - The Radio Rewind detail page, fed `playlist.image` from the
 *     parsed XSPF (Spinbin emits a playlist-level `<image>` element
 *     when one exists).
 */
export function StationCover({
  name,
  color,
  textColor,
  image,
  className,
  textClassName = "px-3 text-lg leading-tight",
}: {
  name: string;
  color: string;
  textColor: string;
  /**
   * URL to the station logo. When null/empty/404, the component
   * falls back to the brand-colour tile with the station name.
   */
  image?: string | null;
  className?: string;
  /** Tailwind classes for the fallback name `<span>`. */
  textClassName?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (image && !errored) {
    return (
      <div
        className={cn("flex items-center justify-center overflow-hidden", className)}
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {/* Logos are SVG/PNG hosted on jherskowitz.github.io. We bypass
            next/image deliberately — these are tiny, already-optimised
            assets and we want a synchronous onError to swap to the
            colour-tile fallback rather than a blank placeholder. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="h-full w-full object-contain p-4"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center text-center font-semibold tracking-tight",
        className,
      )}
      style={{ backgroundColor: color, color: textColor }}
      aria-hidden
    >
      <span className={textClassName}>{name}</span>
    </div>
  );
}

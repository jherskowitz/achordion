"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoverArtProps {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
  rounded?: "none" | "sm" | "md";
}

// Caller's className already governs size — skip the fixed-pixel inline
// style so it can stretch to fill its container.
const SIZED_BY_CLASS = /\b(w-|h-|size-|aspect-)/;

function Placeholder({
  alt,
  radius,
  className,
  sizeStyle,
}: {
  alt: string;
  radius: string;
  className?: string;
  sizeStyle?: { width: number; height: number };
}) {
  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground/60 flex shrink-0 items-center justify-center",
        radius,
        className,
      )}
      style={sizeStyle}
      aria-label={alt}
      role="img"
    >
      <Disc3 className="size-1/2" />
    </div>
  );
}

export function CoverArt({
  src,
  alt,
  size = 64,
  className,
  rounded = "sm",
}: CoverArtProps) {
  const radius =
    rounded === "none" ? "" : rounded === "sm" ? "rounded-md" : "rounded-lg";
  const sizeStyle =
    className && SIZED_BY_CLASS.test(className)
      ? undefined
      : { width: size, height: size };

  const [errored, setErrored] = useState(false);
  // Cover Art Archive 302-redirects to individual archive.org storage
  // nodes that are individually flaky — one request 200s, a re-request
  // can 404/500. Without a retry, a single transient node failure
  // permanently shows the Disc3 placeholder (and, since the cover now
  // renders in both the page skeleton and the resolved header, that
  // showed up as art "loading then 404ing" on the skeleton→header
  // swap). Retry once with a cache-busted URL before giving up: the
  // fresh request re-resolves the CAA redirect, usually to a healthy
  // node. Bounded at one retry so a real outage can't storm archive.org.
  const [retry, setRetry] = useState(0);
  const MAX_COVER_RETRIES = 1;
  // Track the image's load state so we can fade it in once the bytes
  // arrive. Without this the placeholder → real-image swap is a hard
  // pixel snap; with it, the image fades in smoothly over 300ms and
  // transitions between covers (e.g. when LazyTrackCover's lookup
  // resolves) feel calm rather than flickery.
  const [loaded, setLoaded] = useState(false);

  // Reset error + loaded state when the image source changes (user
  // switched album editions, parent revalidated cache, lazy lookup
  // returned a new URL, etc.) so the fade fires again on the new src.
  // Setting state in response to a prop change is the textbook valid
  // case — the lint rule still warns generically.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrored(false);
    setLoaded(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRetry(0);
  }, [src]);


  if (!src || errored) {
    return (
      <Placeholder
        alt={alt}
        radius={radius}
        className={className}
        sizeStyle={sizeStyle}
      />
    );
  }

  // On retry, cache-bust so the browser re-issues the request (and CAA
  // re-resolves its redirect to a fresh node) rather than serving the
  // failed response. The `key` on <Image> forces a remount per attempt.
  const effectiveSrc =
    retry > 0 ? `${src}${src.includes("?") ? "&" : "?"}cb=${retry}` : src;

  // Layer the placeholder BEHIND the image. While the image's bytes are
  // still loading it sits at `opacity-0`, so the Disc3 placeholder shows
  // through underneath — we never flash a blank `bg-muted` box between
  // "placeholder" and "cover". Once `onLoad` fires, the image fades to
  // `opacity-100`, covering the placeholder. (Previously the image
  // *replaced* the placeholder the instant `src` was set, so a long
  // image load showed a blank box: placeholder → blank → cover.)
  return (
    <div
      className={cn(
        "bg-muted relative shrink-0 overflow-hidden",
        radius,
        className,
      )}
      style={sizeStyle}
      aria-label={alt}
      role="img"
    >
      {!loaded && (
        <span className="text-muted-foreground/60 absolute inset-0 flex items-center justify-center">
          <Disc3 className="size-1/2" />
        </span>
      )}
      <Image
        key={effectiveSrc}
        src={effectiveSrc}
        alt={alt}
        width={size}
        height={size}
        unoptimized
        onLoad={() => setLoaded(true)}
        onError={() => {
          // Retry once (cache-busted) on a transient CAA/archive.org
          // failure before falling back to the placeholder.
          if (retry < MAX_COVER_RETRIES) setRetry((r) => r + 1);
          else setErrored(true);
        }}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

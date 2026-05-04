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
  // Track the image's load state so we can fade it in once the bytes
  // arrive. Without this the placeholder → real-image swap is a hard
  // pixel snap; with it, the image fades in smoothly over 300ms and
  // transitions between covers (e.g. when LazyTrackCover's lookup
  // resolves) feel calm rather than flickery.
  const [loaded, setLoaded] = useState(false);

  // Reset error + loaded state when the image source changes (user
  // switched album editions, parent revalidated cache, lazy lookup
  // returned a new URL, etc.) so the fade fires again on the new src.
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
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

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      onLoad={() => setLoaded(true)}
      onError={() => setErrored(true)}
      className={cn(
        "bg-muted shrink-0 object-cover transition-opacity duration-300 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        radius,
        className,
      )}
      style={sizeStyle}
    />
  );
}

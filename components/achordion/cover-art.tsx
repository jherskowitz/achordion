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

  // Reset error state when the image source changes (e.g. user switches
  // album editions or a parent revalidates cache).
  useEffect(() => {
    setErrored(false);
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
      onError={() => setErrored(true)}
      className={cn("bg-muted shrink-0 object-cover", radius, className)}
      style={sizeStyle}
    />
  );
}

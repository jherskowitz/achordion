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
  if (!src) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground/60 flex shrink-0 items-center justify-center",
          radius,
          className,
        )}
        style={sizeStyle}
        aria-label={alt}
      >
        <Disc3 className="size-1/2" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={cn("bg-muted shrink-0 object-cover", radius, className)}
      style={sizeStyle}
    />
  );
}

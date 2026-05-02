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

export function CoverArt({
  src,
  alt,
  size = 64,
  className,
  rounded = "sm",
}: CoverArtProps) {
  const radius =
    rounded === "none" ? "" : rounded === "sm" ? "rounded-md" : "rounded-lg";
  if (!src) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground/60 flex shrink-0 items-center justify-center",
          radius,
          className,
        )}
        style={{ width: size, height: size }}
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
      style={{ width: size, height: size }}
    />
  );
}

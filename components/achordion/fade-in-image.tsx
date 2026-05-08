"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Drop-in `<Image>` that fades in over 300ms once the bytes load.
 * Matches the same load-complete easing as `<CoverArt>` and
 * `<LazyAlbumCover>` so the whole app's async image swaps share one
 * calm motion vocabulary.
 *
 * Use this in place of raw `<Image>` for any cover-art / artwork
 * surface that doesn't already go through `<CoverArt>` (e.g. the
 * Apple Music charts which feed inline `artworkUrl` straight into
 * an `<Image>` tag).
 */
// Destructure `alt` explicitly (it's already required by ImageProps)
// so jsx-a11y/alt-text can statically verify it on the inner <Image>
// — the linter doesn't follow rest-spread arguments.
export function FadeInImage({ className, src, alt, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  // Reset on src change so the fade re-fires when a parent swaps to
  // a different image (e.g. lazy-resolved URL replaces a placeholder).
  // Prop-driven state reset is the textbook valid case for setting
  // state in an effect — the lint rule still flags it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
  }, [src]);

  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        props.onLoad?.(e);
      }}
      className={cn(
        "transition-opacity duration-300 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}

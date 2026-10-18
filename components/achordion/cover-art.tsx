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
  /** Catalog cover-art fallback. When the CAA `src` image fails to load
   *  (after the cache-busted retry), fetch streaming-catalog artwork
   *  (iTunes → Deezer, via /api/album-cover) for this artist + album or
   *  track and swap to it before the Disc3 placeholder — CAA's
   *  archive.org nodes flake on fresh releases, and CAA lacks art for
   *  many new/niche albums entirely. Provide `fallbackArtist` plus one
   *  of `fallbackAlbum` / `fallbackTrack`; omit to keep the old
   *  retry-then-placeholder behavior. */
  fallbackArtist?: string | null;
  fallbackAlbum?: string | null;
  fallbackTrack?: string | null;
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
  fallbackArtist,
  fallbackAlbum,
  fallbackTrack,
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
  // Catalog cover-art fallback (iTunes → Deezer): populated only when
  // the CAA image fails its retry AND fallback props were provided.
  // Once set it takes over as the rendered source; if it ALSO fails we
  // fall through to the placeholder. Guarded so we attempt it at most
  // once per `src`.
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [triedFallback, setTriedFallback] = useState(false);

  // Reset error + loaded state when the image source changes (user
  // switched album editions, parent revalidated cache, lazy lookup
  // returned a new URL, etc.) so the fade fires again on the new src.
  // Setting state in response to a prop change is the textbook valid
  // case — the lint rule still warns generically.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setErrored(false);
    setLoaded(false);
    setRetry(0);
    setFallbackSrc(null);
    setTriedFallback(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [src]);

  const canFallback = !!fallbackArtist && !!(fallbackAlbum || fallbackTrack);

  // Query the streaming catalog (iTunes→Deezer via /api/album-cover) once
  // and swap to the result. Fired in TWO cases: the CAA `src` image 404s
  // after its retry (handleError), AND when there's NO `src` at all (the
  // effect below) — the latter is the common "missing cover" case for
  // direct callers whose cover resolved to nothing (e.g. a scrobble LB
  // never mapped to a release with art). A null `src` never mounts an
  // <Image>, so onError can't fire; without the proactive path the
  // fallback would be dead for every null-cover row.
  function runCatalogFallback() {
    if (!canFallback || triedFallback) {
      setErrored(true);
      return;
    }
    setTriedFallback(true);
    const params = new URLSearchParams({ artist: fallbackArtist! });
    if (fallbackAlbum) params.set("album", fallbackAlbum);
    else if (fallbackTrack) params.set("track", fallbackTrack);
    fetch(`/api/album-cover?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((d: { url: string | null }) => {
        if (d.url) {
          setLoaded(false);
          setFallbackSrc(d.url);
        } else {
          setErrored(true);
        }
      })
      .catch(() => setErrored(true));
  }

  function handleError() {
    // The catalog fallback image also failed — nothing left to try.
    if (fallbackSrc) {
      setErrored(true);
      return;
    }
    // Transient CAA/archive.org failure: retry once (cache-busted).
    if (retry < MAX_COVER_RETRIES) {
      setRetry((r) => r + 1);
      return;
    }
    // CAA retries exhausted — try the streaming-catalog fallback once.
    runCatalogFallback();
  }

  // No `src` to render, but we have catalog search terms → resolve the
  // catalog proactively (the <Image> never mounts with a null src, so
  // handleError can never fire). Lazy covers resolve their own catalog and
  // DON'T pass fallback props, so this never double-fetches for them.
  // runCatalogFallback is a stable in-render closure over these inputs; the
  // setState it does is the intended effect (resolve-then-swap), once per src.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!src && !fallbackSrc && !errored && !triedFallback && canFallback) {
      runCatalogFallback();
    }
  }, [src, fallbackSrc, errored, triedFallback, canFallback]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Placeholder only when there's genuinely nothing to show: errored, or no
  // src AND no catalog result (either still resolving, or the catalog also
  // missed). A null src with a resolved fallbackSrc falls through to render.
  if (errored || (!src && !fallbackSrc)) {
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
  // The catalog fallback URL, once resolved, takes over as the source
  // (rendered as-is — no cache-buster). Otherwise the CAA src, cache-
  // busted on retry.
  // Past the early return at least one of `fallbackSrc` / `src` is set.
  // Prefer the resolved catalog fallback; otherwise the CAA src, cache-
  // busted on retry so the browser re-resolves the redirect to a fresh node.
  const effectiveSrc: string =
    fallbackSrc ??
    (retry > 0 && src
      ? `${src}${src.includes("?") ? "&" : "?"}cb=${retry}`
      : (src ?? ""));

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
        onError={handleError}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

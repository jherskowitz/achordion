"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { faviconUrl } from "@/lib/favicon";

/**
 * Per-row affordance that lazy-loads a track's external streaming
 * links on click and reveals them as a floating popover anchored to
 * the trigger. Zero up-front cost — the API call only fires the
 * first time a user expands a given track row.
 *
 * **Why a popover, not an inline expansion.** Earlier versions slid
 * a wide pill open horizontally between the title and the duration
 * column, which worked on desktop but pushed siblings around on
 * mobile (duration column off-screen, row wraps). The popover
 * leaves the row layout untouched: the trigger is always one small
 * button; the favicon row floats *above* adjacent content (right-
 * anchored, growing leftward) and is dismissed on click-outside.
 *
 * Mounted on track-row primitives (TrackList, LiveScrobbleList,
 * TopTracksList, etc.) as a small icon button next to the duration
 * column. State is per-row local: collapsed by default, expands on
 * click, closes on click-outside or Escape.
 *
 * Server-side resolution lives in `/api/track-links` — calls Odesli
 * with an MB streaming-rel seed (or an explicit seedUrl) and merges
 * with MB url-rels for services Odesli doesn't cover (Bandcamp,
 * Qobuz, etc.).
 */

interface ResolvedLink {
  url: string;
  label: string;
  host: string;
}

interface InlineTrackLinksProps {
  /** Recording MBID — preferred input. We pull MB url-rels server-
   *  side for full coverage of services Odesli misses. */
  recordingMbid?: string | null;
  /** When MBID isn't available, an explicit Odesli seed URL gets us
   *  there. Pass any service URL we already have (e.g. from an LB
   *  scrobble). */
  seedUrl?: string | null;
  /** Exact (artist, title) for the name-alias bridge. Lets a row with
   *  no MBID still surface a track's stored links — including
   *  Parachord submissions under a sibling MBID — when ListenBrainz's
   *  mapper failed to map the scrobble. Pass the scrobble's
   *  artist/track names verbatim; the server normalizes them. */
  artist?: string | null;
  title?: string | null;
}

export function InlineTrackLinks({
  recordingMbid,
  seedUrl,
  artist,
  title,
}: InlineTrackLinksProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const hasName = !!(artist && title);
  const enabled = open && !!(recordingMbid || seedUrl || hasName);
  const queryKey = [
    "track-links",
    recordingMbid ?? null,
    seedUrl ?? null,
    artist ?? null,
    title ?? null,
  ];
  const { data, isFetching, error } = useQuery<{ links: ResolvedLink[] }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (recordingMbid) params.set("mbid", recordingMbid);
      if (seedUrl) params.set("seedUrl", seedUrl);
      if (artist && title) {
        params.set("artist", artist);
        params.set("title", title);
      }
      const r = await fetch(`/api/track-links?${params.toString()}`);
      if (!r.ok) throw new Error(`track-links ${r.status}`);
      return r.json();
    },
    enabled,
    // Streaming mappings are essentially static once Odesli has them
    // indexed — keep the result for the session.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  // Click-outside + Escape to close. Standard popover behaviour —
  // without it, a row's open popover stays mounted indefinitely
  // and obscures adjacent content. Listener is only attached while
  // open so the no-op case stays cheap.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const node = wrapperRef.current;
      if (!node) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Don't render the trigger at all when we have nothing to seed
  // the lookup with — the row's title link still goes to the
  // recording page where the full external-links block lives.
  if (!recordingMbid && !seedUrl && !hasName) return null;

  return (
    <span ref={wrapperRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Hide streaming links" : "Show streaming links"}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full border transition-colors pointer-coarse:size-9",
          open
            ? "border-primary/40 text-primary bg-primary/10"
            : "border-border/60 text-muted-foreground hover:text-foreground",
        )}
      >
        {isFetching ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ExternalLink className="size-3.5" />
        )}
      </button>

      {/* Floating favicon row. Right-anchored to the trigger and
          positioned vertically centered against it so it doesn't
          shift the row when it opens. z-20 keeps it above any
          neighbouring content; the solid background + border give
          enough contrast for readability over a busy row. */}
      {open && (
        <span
          role="menu"
          className={cn(
            "border-border/60 bg-background absolute top-1/2 right-0 z-20",
            "-translate-y-1/2 rounded-full border shadow-md",
            "flex items-center gap-0.5 px-1 py-1 whitespace-nowrap",
            "animate-in fade-in zoom-in-95 duration-150",
          )}
        >
          {error && (
            <span className="text-muted-foreground px-2 text-xs">
              Couldn&apos;t load links
            </span>
          )}
          {data && data.links.length === 0 && !isFetching && (
            <span className="text-muted-foreground px-2 text-xs">
              No streaming links found
            </span>
          )}
          {!data && isFetching && (
            <span className="text-muted-foreground px-2 text-xs">
              Loading…
            </span>
          )}
          {data?.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              title={link.label}
              role="menuitem"
              className="hover:bg-foreground/10 inline-flex size-7 items-center justify-center rounded-full transition-colors pointer-coarse:size-9"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconUrl(link.host)}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                className="size-4 opacity-90"
              />
            </a>
          ))}
        </span>
      )}
    </span>
  );
}

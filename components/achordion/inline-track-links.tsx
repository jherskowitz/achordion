"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Per-row affordance that lazy-loads a track's external streaming
 * links on click and reveals them inline as a favicon row beneath
 * the track. Zero up-front cost — the API call only fires the first
 * time a user expands a given track row.
 *
 * Mounted on track-row primitives (TrackList, LiveScrobbleList,
 * TopTracksList, etc.) as a small icon button next to the track
 * title. State is per-row local: collapsed by default, expands on
 * click, never auto-collapses.
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
}

export function InlineTrackLinks({
  recordingMbid,
  seedUrl,
}: InlineTrackLinksProps) {
  const [open, setOpen] = useState(false);
  const enabled = open && !!(recordingMbid || seedUrl);
  const queryKey = ["track-links", recordingMbid ?? null, seedUrl ?? null];
  const { data, isFetching, error } = useQuery<{ links: ResolvedLink[] }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (recordingMbid) params.set("mbid", recordingMbid);
      if (seedUrl) params.set("seedUrl", seedUrl);
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

  // Don't render the trigger at all when we have nothing to seed
  // the lookup with — the row's title link still goes to the
  // recording page where the full external-links block lives.
  if (!recordingMbid && !seedUrl) return null;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        aria-label={open ? "Hide streaming links" : "Show streaming links"}
        className={cn(
          "text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-full transition-colors pointer-coarse:size-9",
          open && "text-foreground bg-muted/40",
        )}
      >
        {isFetching ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ExternalLink className="size-3.5" />
        )}
      </button>
      {open && (
        <span className="inline-flex flex-wrap items-center gap-1">
          {error && (
            <span className="text-muted-foreground text-xs">
              Couldn&apos;t load links
            </span>
          )}
          {data && data.links.length === 0 && !isFetching && (
            <span className="text-muted-foreground text-xs">
              No streaming links found
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
              className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex size-7 items-center justify-center rounded-md border transition-colors pointer-coarse:size-9"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${link.host}&sz=64`}
                alt=""
                width={14}
                height={14}
                loading="lazy"
                className="size-3.5 opacity-80"
              />
            </a>
          ))}
        </span>
      )}
    </span>
  );
}

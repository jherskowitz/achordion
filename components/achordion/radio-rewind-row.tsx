"use client";

import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { LazyTrackCover } from "./lazy-track-cover";
import { parachordPlayTrack } from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";

/**
 * Single row in the Radio Rewind tracklist. Pulled out of the page
 * file so it can hold local state for the album MBID resolved by
 * `<LazyTrackCover>`'s cover lookup.
 *
 * Spinbin doesn't ship MBIDs, so without this every album-link
 * click would round-trip through `/release-group/lookup`. The cover
 * lookup is firing anyway (CAA URL resolution); piggy-backing on
 * its `onResolved` callback gets the release-group MBID for free.
 * Once the lookup returns, the album link upgrades from the lookup
 * fallback to a direct `/release-group/<mbid>` URL.
 */
export interface RadioRewindRowProps {
  index: number;
  title: string;
  creator: string;
  /** Spinbin's `album` is `string | null`; null = no album line. */
  album?: string | null;
  /** Spinbin sometimes ships a cover URL inline; null means we'll
   *  resolve via the cover-art lookup. */
  initialCover?: string | null | undefined;
}

export function RadioRewindRow({
  index,
  title,
  creator,
  album,
  initialCover,
}: RadioRewindRowProps) {
  const [resolvedMbid, setResolvedMbid] = useState<string | null>(null);
  const albumLabel = album ?? null;
  const albumHref = albumLabel
    ? resolvedMbid
      ? `/release-group/${resolvedMbid}`
      : releaseGroupHref({ artist: creator, title: albumLabel })
    : null;
  return (
    <li className="group flex items-center gap-3 py-3">
      <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
        {index + 1}
      </span>
      <a
        href={parachordPlayTrack({ artist: creator, title })}
        aria-label={`Play "${title}" by ${creator} in Parachord`}
        title="Play in Parachord"
        className="group/cover relative shrink-0 overflow-hidden rounded-md"
      >
        <LazyTrackCover
          artist={creator}
          title={title}
          album={albumLabel}
          alt={albumLabel ?? title}
          size={40}
          initialSrc={initialCover}
          onResolved={({ mbid }) => {
            if (mbid) setResolvedMbid(mbid);
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/cover:opacity-100"
        >
          <Play className="size-4 fill-white text-white" />
        </span>
      </a>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link
            href={recordingHref({ artist: creator, title })}
            className="hover:underline"
          >
            {title}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link
            href={artistHref({ name: creator })}
            className="hover:text-foreground"
          >
            {creator}
          </Link>
          {albumLabel && albumHref && (
            <>
              <span className="mx-1.5 opacity-50">·</span>
              <Link href={albumHref} className="hover:text-foreground italic">
                {albumLabel}
              </Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

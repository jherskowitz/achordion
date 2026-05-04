"use client";

import { useState } from "react";
import Link from "next/link";
import { parachordPlayAlbum, parachordPlayTrack } from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { CoverArt } from "./cover-art";
import { LazyAlbumCover } from "./lazy-album-cover";
import { LazyTrackCover } from "./lazy-track-cover";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import { PlayOverNumberCell } from "./parachord-button";
import type {
  SitewideTopRecording,
  SitewideTopReleaseGroup,
} from "@/lib/clients/listenbrainz";

/**
 * ListenBrainz sitewide-top charts.
 *
 * Albums grid mirrors the !earshot/NACC chart layout (cover tile +
 * rank pill + hover Play FAB + linked title/artist). LB ships
 * `caa_id` + `caa_release_mbid` for every entry, so the cover paints
 * straight off the response — no MB round-trip. When LB happens to
 * have an entry without CAA fields, LazyAlbumCover takes over and
 * resolves via `/api/track-cover` post-paint.
 *
 * Songs list mirrors Apple Music's songs layout (numbered row +
 * cover + linked title/artist). LB doesn't supply cover art for
 * recordings, so we go straight to LazyTrackCover for every row.
 */

function rgCoverUrl(item: SitewideTopReleaseGroup): string | null {
  if (item.caa_release_mbid && item.caa_id) {
    return `https://archive.org/download/mbid-${item.caa_release_mbid}/mbid-${item.caa_release_mbid}-${item.caa_id}_thumb250.jpg`;
  }
  return null;
}

function trackCoverUrl(item: SitewideTopRecording): string | null {
  // LB doesn't include caa_* on recordings; the only inline shot at a
  // cover is when we've got a release_mbid (release-level CAA).
  if (item.release_mbid) return caaReleaseUrl(item.release_mbid, 250);
  return null;
}

/** Single album card. Extracted from the grid so it can hold the
 *  resolved-MBID state for entries where LB didn't ship one — most
 *  of the time `release_group_mbid` is in the LB payload and we
 *  short-circuit, but the fallback path captures whatever the
 *  cover lookup returns. */
function LbAlbumCard({
  item,
  rank,
}: {
  item: SitewideTopReleaseGroup;
  rank: number;
}) {
  const [resolvedMbid, setResolvedMbid] = useState<string | null>(null);
  const effectiveMbid = item.release_group_mbid ?? resolvedMbid;
  const albumLink = effectiveMbid
    ? `/release-group/${effectiveMbid}`
    : releaseGroupHref({
        artist: item.artist_name,
        title: item.release_group_name,
      });
  const playHref = effectiveMbid
    ? parachordPlayAlbum({ mbid: effectiveMbid })
    : parachordPlayAlbum({
        artist: item.artist_name,
        title: item.release_group_name,
      });
  const inlineCover = rgCoverUrl(item);

  return (
    <li className="min-w-0">
      <div className="group relative overflow-hidden rounded-md">
        <Link href={albumLink} className="block">
          <LazyAlbumCover
            artist={item.artist_name}
            album={item.release_group_name}
            alt={item.release_group_name}
            initialSrc={inlineCover}
            // Only ask for an MBID when LB didn't already ship one —
            // saves the parallel /api/track-cover call for the
            // already-resolved happy path.
            onResolved={
              item.release_group_mbid
                ? undefined
                : ({ mbid }) => {
                    if (mbid) setResolvedMbid(mbid);
                  }
            }
          />
        </Link>
        <span
          aria-hidden
          className="bg-foreground/85 text-background pointer-events-none absolute top-2 left-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums"
        >
          {rank}
        </span>
        <PlayOnHoverFab
          href={playHref}
          label={`Play "${item.release_group_name}" by ${item.artist_name} in Parachord`}
        />
      </div>
      <p className="mt-2 truncate text-sm font-medium">
        <Link href={albumLink} className="italic hover:underline">
          {item.release_group_name}
        </Link>
      </p>
      <p className="text-muted-foreground truncate text-xs">
        <Link
          href={artistHref({
            mbid: item.artist_mbids[0],
            name: item.artist_name,
          })}
          className="hover:text-foreground hover:underline"
        >
          {item.artist_name}
        </Link>
      </p>
    </li>
  );
}

export function LbAlbumsChartGrid({
  items,
}: {
  items: SitewideTopReleaseGroup[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No chart data right now. Try again in a minute.
      </p>
    );
  }
  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item, i) => (
        <LbAlbumCard
          key={`${i + 1}-${item.release_group_mbid ?? item.release_group_name}`}
          item={item}
          rank={i + 1}
        />
      ))}
    </ol>
  );
}

export function LbSongsChartList({
  items,
}: {
  items: SitewideTopRecording[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No chart data right now. Try again in a minute.
      </p>
    );
  }
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {items.map((item, i) => {
        const rank = i + 1;
        const trackLink = recordingHref({
          mbid: item.recording_mbid,
          artist: item.artist_name,
          title: item.track_name,
        });
        const playHref = parachordPlayTrack({
          artist: item.artist_name,
          title: item.track_name,
        });
        const inlineCover = trackCoverUrl(item);
        return (
          <li
            key={`${rank}-${item.recording_mbid ?? item.track_name}`}
            className="group flex items-center gap-3 py-3"
          >
            <PlayOverNumberCell number={rank} href={playHref} className="w-7" />
            {inlineCover ? (
              <CoverArt src={inlineCover} alt={item.track_name} size={48} />
            ) : (
              <LazyTrackCover
                artist={item.artist_name}
                title={item.track_name}
                album={item.release_name ?? undefined}
                alt={item.track_name}
                size={48}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <Link href={trackLink} className="hover:underline">
                  {item.track_name}
                </Link>
              </p>
              <p className="text-muted-foreground truncate text-xs">
                <Link
                  href={artistHref({
                    mbid: item.artist_mbids[0],
                    name: item.artist_name,
                  })}
                  className="hover:text-foreground hover:underline"
                >
                  {item.artist_name}
                </Link>
              </p>
            </div>
            <span className="text-muted-foreground/70 shrink-0 tabular-nums text-xs">
              {item.listen_count.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

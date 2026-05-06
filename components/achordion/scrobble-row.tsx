import type { ReactNode } from "react";
import Link from "next/link";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import type { Listen } from "@/lib/clients/listenbrainz";
import { parachordPlayTrack } from "@/lib/parachord";
import { PlayOverCover } from "./parachord-button";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { cn } from "@/lib/utils";

function relativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: now - unixSeconds > 86400 * 365 ? "numeric" : undefined,
  });
}

export function ScrobbleRow({
  listen,
  showRelative = true,
  trailing,
}: {
  listen: Listen;
  showRelative?: boolean;
  /**
   * Optional content rendered at the row's right edge, after the
   * relative timestamp. Used by `LiveScrobbleList` to slot in the
   * `<TrackActionsMenu>` ⋮ button for signed-in viewers without
   * making this row component aware of session state.
   */
  trailing?: ReactNode;
}) {
  const meta = listen.track_metadata;
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ?? meta.additional_info?.recording_mbid;
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];
  // Album text always links at the release-group level (the canonical
  // "this is the album" entity), not at a specific release/edition.
  // LB sometimes ships release_group_mbid in additional_info — when
  // it does, link directly; otherwise hand the lookup route the
  // artist + title pair and let it resolve at click time.
  const releaseGroupMbid = meta.additional_info?.release_group_mbid;
  const cover = caaUrlFromListen(meta, 250);

  return (
    <li className="border-border/60 group flex items-center gap-3 border-b py-3 last:border-b-0">
      <PlayOverCover
        src={cover}
        alt={meta.release_name ?? meta.track_name}
        playHref={parachordPlayTrack({
          artist: meta.artist_name,
          title: meta.track_name,
        })}
        label={`Play "${meta.track_name}" by ${meta.artist_name} in Parachord`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link
            href={recordingHref({
              mbid: recordingMbid,
              artist: meta.artist_name,
              title: meta.track_name,
            })}
            className="hover:underline"
          >
            {meta.track_name}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link
            href={artistHref({ mbid: artistMbid, name: meta.artist_name })}
            className="hover:text-foreground"
          >
            {meta.artist_name}
          </Link>
          {meta.release_name && (
            <>
              <span className={cn("mx-1.5 opacity-50")}>·</span>
              <Link
                href={releaseGroupHref({
                  mbid: releaseGroupMbid,
                  artist: meta.artist_name,
                  title: meta.release_name,
                })}
                className="italic hover:text-foreground"
              >
                {meta.release_name}
              </Link>
            </>
          )}
        </p>
      </div>
      {showRelative && (
        <time
          dateTime={new Date(listen.listened_at * 1000).toISOString()}
          className="text-muted-foreground shrink-0 text-xs tabular-nums"
        >
          {relativeTime(listen.listened_at)}
        </time>
      )}
      {trailing}
    </li>
  );
}

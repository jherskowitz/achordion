import type { ReactNode } from "react";
import Link from "next/link";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import type { Listen } from "@/lib/clients/listenbrainz";
import { deriveListenSource } from "@/lib/listen-source";
import { parachordPlayTrack } from "@/lib/parachord";
import { InlineTrackLinks } from "./inline-track-links";
import { PlayOverCover } from "./parachord-button";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./relative-time";

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
  // The source Parachord (≥ v0.9.4) actually streamed from. Used to
  // seed the link flyout's resolver via Odesli so the track expands to
  // other services even when MB has no url-rel. Absent (null) for older
  // clients / localfiles plays — the flyout then falls back to the
  // recording-MBID resolution path as before.
  const source = deriveListenSource(meta.additional_info);

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
      {/* Lazy streaming-link expansion (the flyout) holds ALL the
          track's links in one place. Seeded with the source URL
          Parachord actually streamed from, so the played service — and
          everything Odesli expands it into — shows up here even when MB
          has no streaming url-rel. No separate per-service link on the
          row: keep them together in the flyout. */}
      <InlineTrackLinks recordingMbid={recordingMbid} seedUrl={source?.url} />
      {showRelative && (
        <RelativeTime
          value={listen.listened_at}
          asTime
          className="text-muted-foreground shrink-0 text-xs tabular-nums"
        />
      )}
      {trailing}
    </li>
  );
}

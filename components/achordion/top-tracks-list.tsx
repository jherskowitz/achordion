import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaReleaseGroupUrl, caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack } from "@/lib/parachord";
import { InlineTrackLinks } from "./inline-track-links";
import { PlayOverNumberCell } from "./parachord-button";
import { artistHref, recordingHref } from "@/lib/entity-links";
import { TrackActionsMenuSlot } from "./track-actions-menu-slot";

interface TrackEntry {
  track_name: string;
  recording_mbid?: string | null;
  artist_name: string;
  artist_mbids?: string[];
  release_name?: string | null;
  release_mbid?: string | null;
  listen_count: number;
  caa_id?: number | string | null;
  caa_release_mbid?: string | null;
}

function coverFor(t: TrackEntry): string | null {
  if (t.caa_release_mbid && t.caa_id) {
    return `https://archive.org/download/mbid-${t.caa_release_mbid}/mbid-${t.caa_release_mbid}-${t.caa_id}_thumb250.jpg`;
  }
  if (t.release_mbid) return caaReleaseUrl(t.release_mbid, 250);
  return null;
}

export function TopTracksList({ tracks }: { tracks: TrackEntry[] }) {
  if (tracks.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No top tracks for this range.
      </p>
    );
  }
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {tracks.map((t, i) => {
        const artistMbid = t.artist_mbids?.[0];
        return (
          <li
            key={`${t.recording_mbid ?? t.track_name}-${i}`}
            className="group flex items-center gap-3 py-3"
          >
            <PlayOverNumberCell
              number={i + 1}
              href={parachordPlayTrack({
                artist: t.artist_name,
                title: t.track_name,
              })}
              className="w-5"
            />
            <CoverArt
              src={coverFor(t)}
              alt={t.release_name ?? t.track_name}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <Link
                  href={recordingHref({
                    mbid: t.recording_mbid,
                    artist: t.artist_name,
                    title: t.track_name,
                  })}
                  className="hover:underline"
                >
                  {t.track_name}
                </Link>
              </p>
              <p className="text-muted-foreground truncate text-xs">
                <Link
                  href={artistHref({ mbid: artistMbid, name: t.artist_name })}
                  className="hover:text-foreground"
                >
                  {t.artist_name}
                </Link>
              </p>
            </div>
            <InlineTrackLinks recordingMbid={t.recording_mbid} />
            {/* Fixed-width count column so the link icon doesn't
                shift between rows when counts vary in digit length. */}
            <span className="text-muted-foreground shrink-0 tabular-nums text-right text-xs min-w-[7ch]">
              {t.listen_count.toLocaleString()}
            </span>
            <TrackActionsMenuSlot
              track={{
                recordingMbid: t.recording_mbid ?? null,
                trackName: t.track_name,
                artistName: t.artist_name,
                releaseMbid: t.release_mbid ?? null,
              }}
            />
          </li>
        );
      })}
    </ol>
  );
}

import Link from "next/link";
import type { ReleaseDetail, Track } from "@/lib/clients/musicbrainz";
import { formatArtistCredit } from "@/lib/clients/musicbrainz";
import { parachordPlayTrack } from "@/lib/parachord";
import { PlayOverNumberCell } from "./parachord-button";

function formatLength(ms?: number | null): string {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface TrackListProps {
  release: ReleaseDetail;
  /** Optional listen-count map keyed by recording MBID. */
  listenCounts?: Map<string, number>;
}

function TrackRow({
  track,
  listenCount,
  fallbackArtist,
}: {
  track: Track;
  listenCount?: number;
  fallbackArtist: string;
}) {
  const recordingMbid = track.recording?.id;
  const trackArtist = formatArtistCredit(track["artist-credit"]).name;
  const artist = trackArtist || fallbackArtist;
  return (
    <li className="group flex items-center gap-4 py-2.5">
      <PlayOverNumberCell
        number={track.number ?? track.position ?? ""}
        href={parachordPlayTrack({ artist, title: track.title })}
        align="right"
        className="w-8"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {recordingMbid ? (
            <Link
              href={`/recording/${recordingMbid}`}
              className="hover:underline"
            >
              {track.title}
            </Link>
          ) : (
            track.title
          )}
        </p>
      </div>
      {listenCount !== undefined && (
        <span className="text-muted-foreground/80 shrink-0 tabular-nums text-xs">
          {listenCount.toLocaleString()}
        </span>
      )}
      <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
        {formatLength(track.length ?? track.recording?.length)}
      </span>
    </li>
  );
}

export function TrackList({ release, listenCounts }: TrackListProps) {
  const media = release.media ?? [];
  if (media.length === 0 || media.every((m) => !m.tracks?.length)) {
    return (
      <p className="text-muted-foreground text-sm">
        No track listing on file.
      </p>
    );
  }
  const showDiscHeading = media.length > 1;
  const fallbackArtist = formatArtistCredit(release["artist-credit"]).name;
  return (
    <div className="border-border/60 rounded-xl border px-4">
      {media.map((medium, i) => (
        <div key={i}>
          {showDiscHeading && (
            <p className="text-muted-foreground/70 mt-3 mb-1 text-xs tracking-wide uppercase">
              {medium.format ?? "Disc"} {medium.position ?? i + 1}
              {medium.title ? ` · ${medium.title}` : ""}
            </p>
          )}
          <ol className="divide-border/60 divide-y">
            {(medium.tracks ?? []).map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                fallbackArtist={fallbackArtist}
                listenCount={
                  track.recording?.id
                    ? listenCounts?.get(track.recording.id)
                    : undefined
                }
              />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

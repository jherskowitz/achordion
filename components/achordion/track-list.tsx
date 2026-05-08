import Link from "next/link";
import type { ReleaseDetail, Track } from "@/lib/clients/musicbrainz";
import { formatArtistCredit } from "@/lib/clients/musicbrainz";
import { parachordPlayTrack } from "@/lib/parachord";
import { recordingHref } from "@/lib/entity-links";
import { ArtistCreditLinks } from "./artist-credit-links";
import { InlineTrackLinks } from "./inline-track-links";
import { PlayOverNumberCell } from "./parachord-button";
import { TrackActionsMenuSlot } from "./track-actions-menu-slot";

/** MusicBrainz's special "Various Artists" entity. */
const VARIOUS_ARTISTS_MBID = "89ad4ac3-39f7-470e-963a-56509c546377";

/**
 * True when each track's artist matters more than the release-level
 * artist credit — compilations and Various Artists releases. We
 * surface a per-track artist column on these so users can browse
 * who's actually performing each track.
 */
function isVariousArtistsRelease(release: ReleaseDetail): boolean {
  const credits = release["artist-credit"] ?? [];
  for (const c of credits) {
    if (c.artist?.id === VARIOUS_ARTISTS_MBID) return true;
    if (c.name.toLowerCase() === "various artists") return true;
  }
  const rg = release["release-group"];
  if (rg?.["secondary-types"]?.includes("Compilation")) return true;
  return false;
}

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
  showArtist,
  releaseMbid,
}: {
  track: Track;
  listenCount?: number;
  fallbackArtist: string;
  showArtist: boolean;
  releaseMbid: string;
}) {
  const recordingMbid = track.recording?.id;
  const credit = formatArtistCredit(track["artist-credit"]);
  const artist = credit.name || fallbackArtist;
  return (
    <li className="group flex items-center gap-4 py-2.5">
      <PlayOverNumberCell
        number={track.number ?? track.position ?? ""}
        href={parachordPlayTrack({ artist, title: track.title })}
        align="center"
        className="w-8"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link
            href={recordingHref({
              mbid: recordingMbid,
              artist,
              title: track.title,
            })}
            className="hover:underline"
          >
            {track.title}
          </Link>
        </p>
        {showArtist && credit.parts.length > 0 && (
          <p className="text-muted-foreground truncate text-xs">
            <ArtistCreditLinks parts={credit.parts} />
          </p>
        )}
      </div>
      {/* Lazy streaming-link expansion sits as the first column
          after the track info — surfaces the affordance closer to
          the title (where the user's eye is) while listen-count /
          duration / overflow stay right-anchored. Renders nothing
          without an MBID. */}
      <InlineTrackLinks recordingMbid={recordingMbid} />
      {listenCount !== undefined && (
        <span className="text-muted-foreground/80 shrink-0 tabular-nums text-xs">
          {listenCount.toLocaleString()}
        </span>
      )}
      <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
        {formatLength(track.length ?? track.recording?.length)}
      </span>
      <TrackActionsMenuSlot
        track={{
          recordingMbid: recordingMbid ?? null,
          trackName: track.title,
          artistName: artist,
          // Album tracklist context is the abstract release group, but
          // the row is bound to a specific release/edition — pass that
          // release MBID through so Pin/Recommend send the same edition
          // the user is looking at.
          releaseMbid,
        }}
      />
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
  const showArtist = isVariousArtistsRelease(release);
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
                showArtist={showArtist}
                releaseMbid={release.id}
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

import Link from "next/link";
import type {
  RecommendedRecordingMbid,
  RecordingMetadata,
} from "@/lib/clients/listenbrainz";
import { CoverArt } from "./cover-art";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack } from "@/lib/parachord";
import { PlayOverNumberCell } from "./parachord-button";

function coverFor(meta: RecordingMetadata | undefined): string | null {
  if (!meta?.release) return null;
  const r = meta.release;
  if (r.caa_release_mbid && r.caa_id) {
    return `https://archive.org/download/mbid-${r.caa_release_mbid}/mbid-${r.caa_release_mbid}-${r.caa_id}_thumb250.jpg`;
  }
  if (r.mbid) return caaReleaseUrl(r.mbid, 250);
  return null;
}

export function ExploreTrackList({
  recordings,
  metadata,
}: {
  recordings: RecommendedRecordingMbid[];
  metadata: Map<string, RecordingMetadata>;
}) {
  if (recordings.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No recommendations yet — listen for a few weeks and check back.
      </p>
    );
  }
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {recordings.map((r, i) => {
        const meta = metadata.get(r.recording_mbid);
        const title = meta?.recording?.name ?? "Unknown track";
        const artist = meta?.artist;
        const artistName = artist?.name ?? "";
        const artistMbid = artist?.artists?.[0]?.artist_mbid ?? null;
        const releaseName = meta?.release?.name ?? null;
        const releaseMbid = meta?.release?.mbid ?? null;
        return (
          <li
            key={r.recording_mbid}
            className="group flex items-center gap-3 py-3"
          >
            <PlayOverNumberCell
              number={i + 1}
              href={parachordPlayTrack({ artist: artistName, title })}
              className="w-5"
            />
            <CoverArt src={coverFor(meta)} alt={releaseName ?? title} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <Link
                  href={`/recording/${r.recording_mbid}`}
                  className="hover:underline"
                >
                  {title}
                </Link>
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {artistMbid ? (
                  <Link
                    href={`/artist/${artistMbid}`}
                    className="hover:text-foreground"
                  >
                    {artistName}
                  </Link>
                ) : (
                  artistName
                )}
                {releaseName && (
                  <>
                    <span className="opacity-50"> · </span>
                    {releaseMbid ? (
                      <Link
                        href={`/release/${releaseMbid}/album`}
                        className="hover:text-foreground italic"
                      >
                        {releaseName}
                      </Link>
                    ) : (
                      <em>{releaseName}</em>
                    )}
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

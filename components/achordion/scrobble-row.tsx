import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import type { Listen } from "@/lib/clients/listenbrainz";
import { parachordPlayTrack } from "@/lib/parachord";
import { ParachordPlayButton } from "./parachord-button";
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
}: {
  listen: Listen;
  showRelative?: boolean;
}) {
  const meta = listen.track_metadata;
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ?? meta.additional_info?.recording_mbid;
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];
  const releaseMbid =
    meta.mbid_mapping?.release_mbid ?? meta.additional_info?.release_mbid;
  const cover = caaUrlFromListen(meta, 250);

  return (
    <li className="border-border/60 group flex items-center gap-3 border-b py-3 last:border-b-0">
      <CoverArt src={cover} alt={meta.release_name ?? meta.track_name} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {recordingMbid ? (
            <Link
              href={`/recording/${recordingMbid}`}
              className="hover:underline"
            >
              {meta.track_name}
            </Link>
          ) : (
            meta.track_name
          )}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {artistMbid ? (
            <Link
              href={`/artist/${artistMbid}`}
              className="hover:text-foreground"
            >
              {meta.artist_name}
            </Link>
          ) : (
            meta.artist_name
          )}
          {meta.release_name && (
            <>
              <span className={cn("mx-1.5 opacity-50")}>·</span>
              {releaseMbid ? (
                <Link
                  href={`/release/${releaseMbid}`}
                  className="hover:text-foreground"
                >
                  {meta.release_name}
                </Link>
              ) : (
                meta.release_name
              )}
            </>
          )}
        </p>
      </div>
      <ParachordPlayButton
        href={parachordPlayTrack({
          artist: meta.artist_name,
          title: meta.track_name,
        })}
      />
      {showRelative && (
        <time
          dateTime={new Date(listen.listened_at * 1000).toISOString()}
          className="text-muted-foreground shrink-0 text-xs tabular-nums"
        >
          {relativeTime(listen.listened_at)}
        </time>
      )}
    </li>
  );
}

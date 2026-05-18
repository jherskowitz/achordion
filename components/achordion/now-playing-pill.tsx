import Link from "next/link";
import { Radio } from "lucide-react";
import { auth } from "@/auth";
import { CoverArt } from "./cover-art";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { ListenAlongLink } from "./listen-along-link";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import { parachordListenAlong } from "@/lib/parachord";
import { artistHref, recordingHref } from "@/lib/entity-links";
import type { PlayingNowListen } from "@/lib/clients/listenbrainz";

export async function NowPlayingPill({
  listen,
  /**
   * The user this listen belongs to, used to construct the
   * `parachord://listen-along` URL. Pass null/undefined to omit the
   * Listen-along action (e.g. for embedding the pill on a context where
   * a username isn't known).
   */
  username,
}: {
  listen: PlayingNowListen;
  username?: string;
}) {
  const session = await auth().catch(() => null);
  const isOwnUser =
    !!username &&
    session?.user?.mbUsername?.toLowerCase() === username.toLowerCase();
  const meta = listen.track_metadata;
  const cover = caaUrlFromListen(meta, 250);
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ??
    meta.additional_info?.recording_mbid;

  return (
    <div className="border-border/60 bg-card/40 flex items-center gap-3 rounded-xl border p-3">
      <CoverArt src={cover} alt={meta.release_name ?? meta.track_name} size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          <span className="bg-primary/80 mr-2 inline-block size-1.5 animate-pulse rounded-full align-middle" />
          Now playing
        </p>
        <p className="mt-0.5 truncate text-sm font-medium">
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
        </p>
      </div>
      {username && !isOwnUser && (
        <IconTooltip label={`Listen along with ${username} in Parachord`}>
          <ListenAlongLink
            target={username}
            href={parachordListenAlong({
              service: "listenbrainz",
              user: username,
            })}
            className="bg-primary text-primary-foreground inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity hover:opacity-90"
          >
            <Radio className="size-3" />
            Listen along
          </ListenAlongLink>
        </IconTooltip>
      )}
    </div>
  );
}

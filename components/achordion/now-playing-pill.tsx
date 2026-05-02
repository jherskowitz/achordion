import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import type { Listen } from "@/lib/clients/listenbrainz";

export function NowPlayingPill({ listen }: { listen: Listen }) {
  const meta = listen.track_metadata;
  const cover = caaUrlFromListen(meta, 250);
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];

  return (
    <div className="border-border/60 bg-card/40 flex items-center gap-3 rounded-xl border p-3">
      <CoverArt src={cover} alt={meta.release_name ?? meta.track_name} size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          <span className="bg-primary/80 mr-2 inline-block size-1.5 animate-pulse rounded-full align-middle" />
          Now playing
        </p>
        <p className="mt-0.5 truncate text-sm font-medium">
          {meta.track_name}
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
        </p>
      </div>
    </div>
  );
}

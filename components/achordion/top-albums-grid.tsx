import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import { parachordPlayAlbum } from "@/lib/parachord";

interface AlbumEntry {
  release_group_name: string;
  release_group_mbid?: string | null;
  artist_name: string;
  artist_mbids?: string[];
  listen_count: number;
  caa_id?: number | string | null;
  caa_release_mbid?: string | null;
}

function coverFor(rg: AlbumEntry): string | null {
  if (rg.caa_release_mbid && rg.caa_id) {
    return `https://archive.org/download/mbid-${rg.caa_release_mbid}/mbid-${rg.caa_release_mbid}-${rg.caa_id}_thumb250.jpg`;
  }
  if (rg.release_group_mbid) {
    return caaReleaseGroupUrl(rg.release_group_mbid, 250);
  }
  return null;
}

export function TopAlbumsGrid({ albums }: { albums: AlbumEntry[] }) {
  if (albums.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No top albums for this range.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {albums.map((rg, i) => {
        // Rank pip overlay matches the chart-tile treatment: pinned
        // top-left of the cover, foreground-on-background pill.
        const rank = i + 1;
        const albumHref = releaseGroupHref({
          mbid: rg.release_group_mbid,
          artist: rg.artist_name,
          title: rg.release_group_name,
        });
        const aHref = artistHref({
          mbid: rg.artist_mbids?.[0],
          name: rg.artist_name,
        });
        // Cover + album-title click target wraps the cover; the
        // artist-name link sits as a sibling so it's independently
        // clickable (nesting <a> inside <a> isn't allowed).
        return (
          <div
            key={`${rg.release_group_mbid ?? rg.release_group_name}-${i}`}
            className="min-w-0"
          >
            {/* Cover container is `group` so the play fab fades in on
                hover. Link wraps the cover + title; the fab is a
                sibling <a> inside the relative container so we don't
                nest anchors. */}
            <div className="group relative overflow-hidden rounded-md">
              <Link href={albumHref} prefetch={false} className="block">
                <CoverArt
                  src={coverFor(rg)}
                  alt={rg.release_group_name}
                  size={240}
                  className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
                  rounded="md"
                />
              </Link>
              <span
                aria-hidden
                className="bg-foreground/85 text-background pointer-events-none absolute top-2 left-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums"
              >
                {rank}
              </span>
              <PlayOnHoverFab
                href={parachordPlayAlbum({
                  ...(rg.release_group_mbid
                    ? { mbid: rg.release_group_mbid }
                    : {
                        artist: rg.artist_name,
                        title: rg.release_group_name,
                      }),
                })}
                label={`Play "${rg.release_group_name}" by ${rg.artist_name} in Parachord`}
              />
            </div>
            <p className="mt-2 truncate text-sm font-medium">
              <Link href={albumHref} prefetch={false} className="hover:underline">
                {rg.release_group_name}
              </Link>
            </p>
            <p className="text-muted-foreground truncate text-xs">
              <Link
                href={aHref}
                prefetch={false}
                className="hover:text-foreground hover:underline"
              >
                {rg.artist_name}
              </Link>
            </p>
            <p className="text-muted-foreground/70 text-xs tabular-nums">
              {rg.listen_count.toLocaleString()} listens
            </p>
          </div>
        );
      })}
    </div>
  );
}

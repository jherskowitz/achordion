import Link from "next/link";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import { parachordPlayAlbum } from "@/lib/parachord";
import type { YimNewRelease } from "@/lib/clients/listenbrainz";

function coverFor(rg: YimNewRelease): string | null {
  if (rg.caa_release_mbid && rg.caa_id) {
    return `https://archive.org/download/mbid-${rg.caa_release_mbid}/mbid-${rg.caa_release_mbid}-${rg.caa_id}_thumb250.jpg`;
  }
  if (rg.release_group_mbid) {
    return caaReleaseGroupUrl(rg.release_group_mbid, 250);
  }
  return null;
}

export function NewReleasesGrid({
  releases,
  limit = 12,
}: {
  releases: YimNewRelease[];
  limit?: number;
}) {
  if (!releases || releases.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No new releases from your top artists this year.
      </p>
    );
  }
  const sliced = releases.slice(0, limit);
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {sliced.map((r, i) => {
        const albumLink = releaseGroupHref({
          mbid: r.release_group_mbid,
          artist: r.artist_credit_name,
          title: r.title,
        });
        const aLink = artistHref({
          mbid: r.artist_credit_mbids?.[0],
          name: r.artist_credit_name,
        });
        return (
          <div
            key={`${r.release_group_mbid ?? r.title}-${i}`}
            className="min-w-0"
          >
            <div className="group relative overflow-hidden rounded-md">
              <Link href={albumLink} className="block">
                <CoverArt
                  src={coverFor(r)}
                  alt={r.title}
                  size={240}
                  className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
                  rounded="md"
                />
              </Link>
              <PlayOnHoverFab
                href={parachordPlayAlbum({
                  ...(r.release_group_mbid
                    ? { mbid: r.release_group_mbid }
                    : { artist: r.artist_credit_name, title: r.title }),
                })}
                label={`Play "${r.title}" by ${r.artist_credit_name} in Parachord`}
              />
            </div>
            <p className="mt-2 truncate text-sm font-medium">
              <Link href={albumLink} className="hover:underline">
                {r.title}
              </Link>
            </p>
            <p className="text-muted-foreground truncate text-xs">
              <Link
                href={aLink}
                className="hover:text-foreground hover:underline"
              >
                {r.artist_credit_name}
              </Link>
            </p>
          </div>
        );
      })}
    </div>
  );
}

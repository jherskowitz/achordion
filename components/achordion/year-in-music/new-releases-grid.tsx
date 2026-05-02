import Link from "next/link";
import { CoverArt } from "@/components/achordion/cover-art";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
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
        const inner = (
          <>
            <CoverArt
              src={coverFor(r)}
              alt={r.title}
              size={240}
              className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
              rounded="md"
            />
            <p className="mt-2 truncate text-sm font-medium">{r.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {r.artist_credit_name}
            </p>
          </>
        );
        return r.release_group_mbid ? (
          <Link
            key={`${r.release_group_mbid}-${i}`}
            href={`/release-group/${r.release_group_mbid}`}
            className="group min-w-0"
          >
            {inner}
          </Link>
        ) : (
          <div key={i} className="min-w-0">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

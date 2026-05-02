import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";

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
        const inner = (
          <>
            <CoverArt
              src={coverFor(rg)}
              alt={rg.release_group_name}
              size={240}
              className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
              rounded="md"
            />
            <p className="mt-2 truncate text-sm font-medium">
              {rg.release_group_name}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {rg.artist_name}
            </p>
            <p className="text-muted-foreground/70 text-xs tabular-nums">
              {rg.listen_count.toLocaleString()} listens
            </p>
          </>
        );
        return rg.release_group_mbid ? (
          <Link
            key={`${rg.release_group_mbid}-${i}`}
            href={`/release-group/${rg.release_group_mbid}`}
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

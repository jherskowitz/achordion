import Link from "next/link";
import Image from "next/image";
import { parachordPlayAlbum } from "@/lib/parachord";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import type { EarshotChartItem } from "@/lib/clients/earshot";

/**
 * !earshot Top 50 — an *album* chart. Rendered as a cover-art tile
 * grid that mirrors the Apple Music Albums layout for visual parity
 * across charts. Cover-art URLs come from Earshot's cover-art dialog
 * endpoint (resolved server-side at fetch time and cached); when a
 * disc has no image on file, we fall back to a neutral placeholder
 * tile rather than padding it with text.
 */
function CollegeAlbumCard({ item }: { item: EarshotChartItem }) {
  const albumHref = releaseGroupHref({
    artist: item.artist,
    title: item.album,
  });
  const playHref = parachordPlayAlbum({
    artist: item.artist,
    title: item.album,
  });

  const cover = item.coverArtUrl ? (
    <Image
      src={item.coverArtUrl}
      alt={item.album}
      width={500}
      height={500}
      className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
      unoptimized
    />
  ) : (
    <div className="bg-muted aspect-square w-full transition-opacity group-hover:opacity-90" />
  );

  return (
    <li className="min-w-0">
      <div className="group relative overflow-hidden rounded-md">
        <Link href={albumHref} className="block">
          {cover}
        </Link>
        <span
          aria-hidden
          className="bg-foreground/85 text-background pointer-events-none absolute top-2 left-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums"
        >
          {item.rank}
        </span>
        <PlayOnHoverFab
          href={playHref}
          label={`Play "${item.album}" by ${item.artist} in Parachord`}
        />
      </div>
      <p className="mt-2 truncate text-sm font-medium">
        <Link href={albumHref} className="italic hover:underline">
          {item.album}
        </Link>
      </p>
      <p className="text-muted-foreground truncate text-xs">
        <Link
          href={artistHref({ name: item.artist })}
          className="hover:text-foreground hover:underline"
        >
          {item.artist}
        </Link>
      </p>
    </li>
  );
}

export function CollegeChartsAlbumsGrid({
  items,
}: {
  items: EarshotChartItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No chart data right now. Try again in a minute.
      </p>
    );
  }
  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it) => (
        <CollegeAlbumCard
          key={`${it.rank}-${it.artist}-${it.album}`}
          item={it}
        />
      ))}
    </ol>
  );
}

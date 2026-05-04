"use client";

import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { FadeInImage } from "./fade-in-image";
import { LazyAlbumCover } from "./lazy-album-cover";
import {
  parachordPlayAlbum,
  parachordPlayTrack,
} from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import type { AppleChartItem } from "@/lib/clients/apple-charts";

/**
 * Songs chart — numbered list row, cover + title + artist, play button
 * launches Parachord. Apple's artwork URLs are absolute and CORS-clean,
 * but they're not in next.config.ts's image allowlist. Plain <img> for
 * now (we can move to Image later by adding the host pattern).
 */
export function ChartsSongsList({ items }: { items: AppleChartItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No tracks in this chart.</p>
    );
  }
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {items.map((t) => (
        <li
          key={t.id}
          className="group flex items-center gap-3 py-3"
        >
          <span className="text-muted-foreground w-7 shrink-0 text-xs tabular-nums">
            {t.rank}
          </span>
          <a
            href={parachordPlayTrack({ artist: t.artistName, title: t.name })}
            aria-label={`Play "${t.name}" by ${t.artistName} in Parachord`}
            title="Play in Parachord"
            className="group/cover relative shrink-0 overflow-hidden rounded-md"
          >
            {t.artworkUrl ? (
              <FadeInImage
                src={t.artworkUrl}
                alt={t.name}
                width={48}
                height={48}
                className="size-12 object-cover"
                unoptimized
              />
            ) : (
              <div className="bg-muted size-12" />
            )}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/cover:opacity-100"
            >
              <Play className="size-4 fill-white text-white" />
            </span>
          </a>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              <Link
                href={recordingHref({ artist: t.artistName, title: t.name })}
                className="hover:underline"
              >
                {t.name}
              </Link>
            </p>
            <p className="text-muted-foreground truncate text-xs">
              <Link
                href={artistHref({ name: t.artistName })}
                className="hover:text-foreground hover:underline"
              >
                {t.artistName}
              </Link>
              {t.genres[0] && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  {t.genres[0]}
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ChartsAlbumCard({ item }: { item: AppleChartItem }) {
  // Apple ships the cover URL inline (no MB call needed for cover),
  // but we still want the resolved release-group MBID so album +
  // play hrefs go directly to /release-group/<mbid> instead of
  // round-tripping through /release-group/lookup on click. Hand
  // Apple's URL to LazyAlbumCover as `initialSrc` so the cover
  // paints instantly, AND wire `onResolved` to capture the MBID
  // from the parallel `/api/track-cover` resolver.
  const [resolvedMbid, setResolvedMbid] = useState<string | null>(null);
  const albumHref = resolvedMbid
    ? `/release-group/${resolvedMbid}`
    : releaseGroupHref({ artist: item.artistName, title: item.name });
  const playHref = resolvedMbid
    ? parachordPlayAlbum({ mbid: resolvedMbid })
    : parachordPlayAlbum({ artist: item.artistName, title: item.name });

  const cover = item.artworkUrl ? (
    <LazyAlbumCover
      artist={item.artistName}
      album={item.name}
      alt={item.name}
      initialSrc={item.artworkUrl}
      onResolved={({ mbid }) => {
        if (mbid) setResolvedMbid(mbid);
      }}
    />
  ) : (
    <div className="bg-muted aspect-square w-full" />
  );

  return (
    <li className="min-w-0">
      {/* Cover + rank in one container so the Play fab can sit on top
          of the cover Link without nesting anchors. */}
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
          label={`Play "${item.name}" by ${item.artistName} in Parachord`}
        />
      </div>
      <p className="mt-2 truncate text-sm font-medium">
        <Link href={albumHref} className="hover:underline">
          {item.name}
        </Link>
      </p>
      <p className="text-muted-foreground truncate text-xs">
        <Link
          href={artistHref({ name: item.artistName })}
          className="hover:text-foreground hover:underline"
        >
          {item.artistName}
        </Link>
      </p>
    </li>
  );
}

/**
 * Albums chart — cover-art grid. Renders synchronously: cover + title
 * link to /release-group/lookup, which resolves the MBID on click.
 */
export function ChartsAlbumsGrid({ items }: { items: AppleChartItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No albums in this chart.</p>
    );
  }
  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((a) => (
        <ChartsAlbumCard key={a.id} item={a} />
      ))}
    </ol>
  );
}

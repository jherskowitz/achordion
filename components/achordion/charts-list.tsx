import Image from "next/image";
import { Play } from "lucide-react";
import {
  parachordPlayAlbum,
  parachordPlayTrack,
} from "@/lib/parachord";
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
              <Image
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
            <p className="truncate text-sm font-medium">{t.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {t.artistName}
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

/**
 * Albums chart — cover-art grid, click to play in Parachord.
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
        <li key={a.id} className="min-w-0">
          <a
            href={parachordPlayAlbum({
              artist: a.artistName,
              title: a.name,
            })}
            title={`Play "${a.name}" by ${a.artistName} in Parachord`}
            className="group block"
          >
            <div className="relative overflow-hidden rounded-md">
              {a.artworkUrl ? (
                <Image
                  src={a.artworkUrl}
                  alt={a.name}
                  width={500}
                  height={500}
                  className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                  unoptimized
                />
              ) : (
                <div className="bg-muted aspect-square w-full" />
              )}
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Play className="size-6 fill-white text-white" />
              </span>
              <span
                aria-hidden
                className="bg-foreground/85 text-background absolute top-2 left-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums"
              >
                {a.rank}
              </span>
            </div>
            <p className="mt-2 truncate text-sm font-medium">{a.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {a.artistName}
            </p>
          </a>
        </li>
      ))}
    </ol>
  );
}

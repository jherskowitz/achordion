import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import {
  parachordPlayAlbum,
  parachordPlayTrack,
} from "@/lib/parachord";
import { searchReleaseGroups } from "@/lib/clients/musicbrainz";
import type { AppleChartItem } from "@/lib/clients/apple-charts";
import { Skeleton } from "@/components/ui/skeleton";

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
 * Resolve a chart album to a MusicBrainz release-group MBID by name +
 * artist. Same Album-over-EP-over-rest preference as the Critical
 * Darlings card, since chart entries are almost always full albums and
 * a same-titled single shouldn't outrank the album in the link target.
 */
async function resolveAlbumMbid(item: AppleChartItem): Promise<string | null> {
  try {
    const q = `release:"${item.name.replace(/"/g, '\\"')}" AND artist:"${item.artistName.replace(/"/g, '\\"')}"`;
    const results = await searchReleaseGroups(q, 8);
    if (results.length === 0) return null;
    const album = results.find((r) => r["primary-type"] === "Album");
    const ep = results.find((r) => r["primary-type"] === "EP");
    return (album ?? ep ?? results[0]).id;
  } catch {
    return null;
  }
}

async function ChartsAlbumCard({ item }: { item: AppleChartItem }) {
  const mbid = await resolveAlbumMbid(item);
  const releaseGroupHref = mbid ? `/release-group/${mbid}` : null;
  const playHref = parachordPlayAlbum({
    artist: item.artistName,
    title: item.name,
    ...(mbid ? { mbid } : {}),
  });

  const cover = item.artworkUrl ? (
    <Image
      src={item.artworkUrl}
      alt={item.name}
      width={500}
      height={500}
      className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
      unoptimized
    />
  ) : (
    <div className="bg-muted aspect-square w-full" />
  );

  return (
    <li className="min-w-0">
      {/* Cover + rank in one container so the Play fab can sit on top
          of the cover Link without nesting anchors. */}
      <div className="group relative overflow-hidden rounded-md">
        {releaseGroupHref ? (
          <Link href={releaseGroupHref} className="block">
            {cover}
          </Link>
        ) : (
          cover
        )}
        <span
          aria-hidden
          className="bg-foreground/85 text-background pointer-events-none absolute top-2 left-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums"
        >
          {item.rank}
        </span>
        <a
          href={playHref}
          aria-label={`Play "${item.name}" by ${item.artistName} in Parachord`}
          title="Play in Parachord"
          className="bg-foreground text-background absolute right-2 bottom-2 inline-flex size-9 translate-y-1 items-center justify-center rounded-full opacity-0 shadow-md transition-all group-hover:translate-y-0 group-hover:opacity-100 hover:opacity-90"
        >
          <Play className="size-4 fill-current" />
        </a>
      </div>
      <p className="mt-2 truncate text-sm font-medium">
        {releaseGroupHref ? (
          <Link href={releaseGroupHref} className="hover:underline">
            {item.name}
          </Link>
        ) : (
          item.name
        )}
      </p>
      <p className="text-muted-foreground truncate text-xs">
        {item.artistName}
      </p>
    </li>
  );
}

function ChartsAlbumCardSkeleton({ rank }: { rank: number }) {
  return (
    <li className="min-w-0 space-y-2">
      <div className="relative">
        <Skeleton className="aspect-square w-full rounded-md" />
        <span
          aria-hidden
          className="bg-foreground/85 text-background absolute top-2 left-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums"
        >
          {rank}
        </span>
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </li>
  );
}

/**
 * Albums chart — cover-art grid. Each card lazily resolves a
 * release-group MBID via MusicBrainz so the title and cover link to the
 * canonical /release-group/<mbid> page; a separate Play fab sits on top
 * for the parachord:// shortcut. MB's 1-req/sec rate limit serialises
 * the resolves, so we wrap each card in its own Suspense boundary —
 * cards stream in as their MBIDs resolve rather than blocking the
 * whole grid.
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
        <Suspense
          key={a.id}
          fallback={<ChartsAlbumCardSkeleton rank={a.rank} />}
        >
          <ChartsAlbumCard item={a} />
        </Suspense>
      ))}
    </ol>
  );
}

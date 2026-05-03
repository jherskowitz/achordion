import { Suspense } from "react";
import Link from "next/link";
import { ArtistAvatar } from "./artist-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { artistHref } from "@/lib/entity-links";

interface ArtistEntry {
  artist_name: string;
  artist_mbid?: string | null;
  listen_count: number;
}

export function TopArtistsList({ artists }: { artists: ArtistEntry[] }) {
  if (artists.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No top artists for this range.
      </p>
    );
  }
  const max = artists[0]?.listen_count ?? 1;
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {artists.map((a, i) => {
        const pct = Math.round((a.listen_count / max) * 100);
        return (
          <li
            key={`${a.artist_mbid ?? a.artist_name}-${i}`}
            className="relative flex items-center gap-3 py-3"
          >
            <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">
              {i + 1}
            </span>
            {a.artist_mbid ? (
              <Suspense
                fallback={<Skeleton className="size-9 shrink-0 rounded-full" />}
              >
                <ArtistAvatar
                  mbid={a.artist_mbid}
                  name={a.artist_name}
                  className="size-9 shrink-0"
                  fallbackClassName="text-xs"
                  width={128}
                />
              </Suspense>
            ) : (
              <div className="bg-muted size-9 shrink-0 rounded-full" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <Link
                  href={artistHref({
                    mbid: a.artist_mbid,
                    name: a.artist_name,
                  })}
                  className="hover:underline"
                >
                  {a.artist_name}
                </Link>
              </p>
              <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
                <div
                  className="bg-foreground/70 h-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
              {a.listen_count.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

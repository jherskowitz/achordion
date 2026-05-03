import { Suspense } from "react";
import Link from "next/link";
import type { SimilarArtist } from "@/lib/clients/listenbrainz";
import { ArtistAvatar } from "./artist-avatar";
import { Skeleton } from "@/components/ui/skeleton";

function ArtistAvatarSkeleton() {
  return <Skeleton className="size-12 shrink-0 rounded-full" />;
}

export function SimilarArtists({ artists }: { artists: SimilarArtist[] }) {
  if (artists.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {artists.map((a) => (
        <Link
          key={a.artist_mbid}
          href={`/artist/${a.artist_mbid}`}
          className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex min-w-0 items-center gap-3 rounded-xl border p-4 transition-colors"
        >
          <Suspense fallback={<ArtistAvatarSkeleton />}>
            <ArtistAvatar
              mbid={a.artist_mbid}
              name={a.name}
              className="size-12 shrink-0"
              fallbackClassName="text-sm"
              width={128}
            />
          </Suspense>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{a.name}</p>
            {a.comment ? (
              <p className="text-muted-foreground/80 mt-0.5 line-clamp-2 text-xs leading-5">
                {a.comment}
              </p>
            ) : (
              a.type && (
                <p className="text-muted-foreground/70 mt-0.5 text-xs">
                  {a.type}
                </p>
              )
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

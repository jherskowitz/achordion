import Link from "next/link";
import type { SimilarArtist } from "@/lib/clients/listenbrainz";

export function SimilarArtists({ artists }: { artists: SimilarArtist[] }) {
  if (artists.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {artists.map((a) => (
        <Link
          key={a.artist_mbid}
          href={`/artist/${a.artist_mbid}`}
          className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group min-w-0 rounded-xl border p-4 transition-colors"
        >
          <p className="truncate text-sm font-medium">{a.name}</p>
          {a.comment ? (
            <p className="text-muted-foreground/80 mt-1 line-clamp-2 text-xs leading-5">
              {a.comment}
            </p>
          ) : (
            a.type && (
              <p className="text-muted-foreground/70 mt-1 text-xs">{a.type}</p>
            )
          )}
        </Link>
      ))}
    </div>
  );
}

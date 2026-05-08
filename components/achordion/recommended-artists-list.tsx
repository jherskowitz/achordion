import { Suspense } from "react";
import Link from "next/link";
import type {
  RecommendedRecordingMbid,
  RecordingMetadata,
} from "@/lib/clients/listenbrainz";
import { ArtistAvatar } from "./artist-avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface ArtistAggregate {
  mbid: string;
  name: string;
  count: number;
  bestScore: number;
}

/**
 * Aggregate the user's recommended recordings into recommended artists.
 * LB doesn't ship a per-artist recommendation endpoint, but artists with
 * the most recommended-tracks (and the highest top score) are a
 * reasonable proxy. We sort by count desc, score desc as tiebreaker.
 *
 * `excludeMbids` is a set of artist MBIDs the caller wants kept out
 * of the result — typically the user's top all-time artists, so the
 * "recommended" rail surfaces artists they haven't already listened
 * to a lot.
 */
function aggregateArtists(
  recordings: RecommendedRecordingMbid[],
  metadata: Map<string, RecordingMetadata>,
  limit: number,
  excludeMbids: Set<string>,
): ArtistAggregate[] {
  const byMbid = new Map<string, ArtistAggregate>();
  for (const r of recordings) {
    const meta = metadata.get(r.recording_mbid);
    const a = meta?.artist?.artists?.[0];
    if (!a?.artist_mbid || !a.name) continue;
    if (excludeMbids.has(a.artist_mbid)) continue;
    const existing = byMbid.get(a.artist_mbid);
    if (existing) {
      existing.count += 1;
      existing.bestScore = Math.max(existing.bestScore, r.score);
    } else {
      byMbid.set(a.artist_mbid, {
        mbid: a.artist_mbid,
        name: a.name,
        count: 1,
        bestScore: r.score,
      });
    }
  }
  return Array.from(byMbid.values())
    .sort((a, b) => b.count - a.count || b.bestScore - a.bestScore)
    .slice(0, limit);
}

export function RecommendedArtistsList({
  recordings,
  metadata,
  limit = 12,
  excludeMbids,
  /**
   * Layout variant:
   *   - "grid" (default) — 2/3/4-column tile grid for the main column.
   *   - "stack" — single-column compact rows for sidebar use.
   */
  layout = "grid",
}: {
  recordings: RecommendedRecordingMbid[];
  metadata: Map<string, RecordingMetadata>;
  limit?: number;
  /** Artist MBIDs to keep out of the result (typically top all-time
   *  artists — "recommended" should mean new, not familiar). */
  excludeMbids?: Set<string>;
  layout?: "grid" | "stack";
}) {
  const artists = aggregateArtists(
    recordings,
    metadata,
    limit,
    excludeMbids ?? new Set(),
  );
  if (artists.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No artist recommendations yet.
      </p>
    );
  }
  if (layout === "stack") {
    return (
      <ul className="space-y-1">
        {artists.map((a) => (
          <li key={a.mbid}>
            <Link
              href={`/artist/${a.mbid}`}
              className="hover:bg-muted/40 group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5"
            >
              <Suspense
                fallback={<Skeleton className="size-8 shrink-0 rounded-full" />}
              >
                <ArtistAvatar
                  mbid={a.mbid}
                  name={a.name}
                  className="size-8 shrink-0"
                  fallbackClassName="text-[10px]"
                  width={96}
                />
              </Suspense>
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {artists.map((a) => (
        <li key={a.mbid}>
          <Link
            href={`/artist/${a.mbid}`}
            className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex min-w-0 items-center gap-3 rounded-xl border p-4 transition-colors"
          >
            <Suspense
              fallback={<Skeleton className="size-12 shrink-0 rounded-full" />}
            >
              <ArtistAvatar
                mbid={a.mbid}
                name={a.name}
                className="size-12 shrink-0"
                fallbackClassName="text-sm"
                width={128}
              />
            </Suspense>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="text-muted-foreground/80 mt-0.5 text-xs">
                {a.count} recommended track{a.count === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

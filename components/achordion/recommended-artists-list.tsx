import Link from "next/link";
import type {
  RecommendedRecordingMbid,
  RecordingMetadata,
} from "@/lib/clients/listenbrainz";

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
 */
function aggregateArtists(
  recordings: RecommendedRecordingMbid[],
  metadata: Map<string, RecordingMetadata>,
  limit: number,
): ArtistAggregate[] {
  const byMbid = new Map<string, ArtistAggregate>();
  for (const r of recordings) {
    const meta = metadata.get(r.recording_mbid);
    const a = meta?.artist?.artists?.[0];
    if (!a?.artist_mbid || !a.name) continue;
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
}: {
  recordings: RecommendedRecordingMbid[];
  metadata: Map<string, RecordingMetadata>;
  limit?: number;
}) {
  const artists = aggregateArtists(recordings, metadata, limit);
  if (artists.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No artist recommendations yet.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {artists.map((a) => (
        <li key={a.mbid}>
          <Link
            href={`/artist/${a.mbid}`}
            className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group block min-w-0 rounded-xl border p-4 transition-colors"
          >
            <p className="truncate text-sm font-medium">{a.name}</p>
            <p className="text-muted-foreground/80 mt-1 text-xs">
              {a.count} recommended track{a.count === 1 ? "" : "s"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

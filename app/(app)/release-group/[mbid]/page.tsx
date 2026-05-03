import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  formatArtistCredit,
  getRelease,
  getReleaseGroup,
  partitionArtistRelations,
  pickCanonicalRelease,
  type ReleaseDetail,
} from "@/lib/clients/musicbrainz";
import type { ParachordTrack } from "@/lib/parachord";
import {
  getReleaseGroupListeners,
  getTopRecordingsForArtist,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { AlbumHeader } from "@/components/achordion/album-header";
import { TrackList } from "@/components/achordion/track-list";
import { TopListenersList } from "@/components/achordion/top-listeners-list";
import { ExternalLinks } from "@/components/achordion/external-links";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ mbid: string }>;
}

async function fetchListenCounts(
  release: ReleaseDetail,
  artistId: string | null,
): Promise<Map<string, number>> {
  if (!artistId) return new Map();
  const recordings = await getTopRecordingsForArtist(artistId);
  const trackIds = new Set<string>();
  for (const m of release.media ?? []) {
    for (const t of m.tracks ?? []) {
      if (t.recording?.id) trackIds.add(t.recording.id);
    }
  }
  const map = new Map<string, number>();
  for (const r of recordings) {
    if (trackIds.has(r.recording_mbid) && r.total_listen_count !== undefined) {
      map.set(r.recording_mbid, r.total_listen_count);
    }
  }
  return map;
}

async function AlbumBody({ mbid }: { mbid: string }) {
  let rg;
  try {
    rg = await getReleaseGroup(mbid);
  } catch {
    notFound();
  }

  const credit = formatArtistCredit(rg["artist-credit"]);
  const canonical = pickCanonicalRelease(rg);
  const { urls } = partitionArtistRelations(rg);

  const [release, listeners] = await Promise.all([
    canonical ? getRelease(canonical.id).catch(() => null) : Promise.resolve(null),
    getReleaseGroupListeners(mbid).catch(() => null),
  ]);

  const listenCounts = release
    ? await fetchListenCounts(release, credit.primaryArtistId)
    : new Map<string, number>();

  const parachordTracks: ParachordTrack[] | undefined = release
    ? release.media
        ?.flatMap((m) => m.tracks ?? [])
        .map((t): ParachordTrack => {
          const trackArtist =
            formatArtistCredit(t["artist-credit"]).name || credit.name;
          const lengthMs = t.length ?? t.recording?.length;
          return {
            title: t.title,
            artist: trackArtist,
            album: rg.title,
            ...(lengthMs ? { duration: Math.round(lengthMs / 1000) } : {}),
          };
        })
    : undefined;

  return (
    <>
      <AlbumHeader
        rg={rg}
        totalListens={listeners?.total_listen_count}
        totalListeners={listeners?.total_user_count}
        parachordTracks={parachordTracks}
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-12">
          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Tracks
            </h2>
            {release ? (
              <TrackList release={release} listenCounts={listenCounts} />
            ) : (
              <ComingSoon
                title="No track listing"
                description="MusicBrainz doesn't have a release on file we can show tracks from."
              />
            )}
          </section>

        </div>

        <aside className="space-y-8">
          {listeners?.listeners && listeners.listeners.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                Top listeners
              </h3>
              <TopListenersList listeners={listeners.listeners} />
            </div>
          )}
          {urls.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                Links
              </h3>
              <ExternalLinks links={urls} />
            </div>
          )}
          <div className="border-border/60 border-t pt-4">
            <a
              href={`https://musicbrainz.org/release-group/${rg.id}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1.5 text-xs"
            >
              <Pencil className="size-3" />
              Edit on MusicBrainz
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mt-8 mb-10 grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-8">
      <Skeleton className="aspect-square w-full max-w-[280px] rounded-md sm:max-w-none" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

export default async function ReleaseGroupPage({ params }: PageParams) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={<HeaderSkeleton />}>
        <AlbumBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}

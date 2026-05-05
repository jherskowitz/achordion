import Link from "next/link";
import { Suspense } from "react";
import {
  getRecentListens,
  getCurrentPin,
} from "@/lib/clients/listenbrainz";
import {
  getRecording,
  partitionArtistRelations,
} from "@/lib/clients/musicbrainz";
import { categoriseLinks } from "@/components/achordion/external-links";
import { LiveScrobbleList } from "@/components/achordion/live-scrobble-list";
import { PinnedTrackCard } from "@/components/achordion/pinned-track-card";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import {
  WeeklyStatsSidebar,
  WeeklyStatsSidebarSkeleton,
} from "@/components/achordion/weekly-stats-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function PinnedSection({ name }: { name: string }) {
  try {
    const pin = await getCurrentPin(name);
    if (!pin) return null;
    // Mirror the recording-page extraction: getRecording → relations →
    // partitionArtistRelations → categoriseLinks. Fetch failure just
    // drops the favicon row; the card still renders with the "+" tile
    // (PinnedTrackCard handles the empty-links case).
    const recordingMbid =
      pin.track_metadata.mbid_mapping?.recording_mbid ??
      pin.track_metadata.additional_info?.recording_mbid ??
      pin.recording_mbid ??
      null;
    let streamingLinks: ReturnType<typeof categoriseLinks>["streaming"] = [];
    if (recordingMbid) {
      const recording = await getRecording(recordingMbid).catch(() => null);
      if (recording) {
        const { urls } = partitionArtistRelations({
          relations: recording.relations,
        });
        streamingLinks = categoriseLinks(urls).streaming;
      }
    }
    return (
      <PinnedTrackCard pin={pin} variant="hero" streamingLinks={streamingLinks} />
    );
  } catch {
    return null;
  }
}

async function RecentListensSection({ name }: { name: string }) {
  try {
    const listens = await getRecentListens(name, { count: 25 });
    return (
      <>
        <LiveScrobbleList username={name} initialListens={listens} />
        {listens.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              href={`/user/${name}/listens`}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              See full listen history →
            </Link>
          </div>
        )}
      </>
    );
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't reach ListenBrainz"
        description={err instanceof Error ? err.message : "Try again in a moment."}
      />
    );
  }
}

function ScrobbleListSkeleton() {
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-12 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ul>
  );
}

export default async function UserOverviewPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <Suspense fallback={null}>
        <PinnedSection name={name} />
      </Suspense>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
            Recent listens
          </h2>
          <Suspense fallback={<ScrobbleListSkeleton />}>
            <RecentListensSection name={name} />
          </Suspense>
        </div>
        <aside className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            In Heavy Rotation
          </h2>
          <Suspense fallback={<WeeklyStatsSidebarSkeleton />}>
            <WeeklyStatsSidebar name={name} />
          </Suspense>
        </aside>
      </div>
    </PageShell>
  );
}

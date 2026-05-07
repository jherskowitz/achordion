import { Suspense } from "react";
import {
  getDailyActivity,
  getListeningActivity,
  getUserTopArtists,
  getUserTopReleaseGroups,
  getUserTopRecordings,
  STAT_RANGES,
  type StatRange,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { StatRangePicker } from "@/components/achordion/stat-range-picker";
import { TopArtistsList } from "@/components/achordion/top-artists-list";
import { TopAlbumsGrid } from "@/components/achordion/top-albums-grid";
import { TopTracksList } from "@/components/achordion/top-tracks-list";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { topRecordingsToParachordTracks } from "@/lib/parachord-listens";
import { ListeningActivityChart } from "@/components/achordion/listening-activity-chart";
import { DailyHeatmap } from "@/components/achordion/daily-heatmap";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string }>;
}

function parseRange(value: string | undefined): StatRange {
  return STAT_RANGES.includes(value as StatRange)
    ? (value as StatRange)
    : "all_time";
}

async function ArtistsSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  try {
    const artists = await getUserTopArtists(name, range, 25);
    return <TopArtistsList artists={artists} />;
  } catch (err) {
    return (
      <EmptyState
        title="Couldn't load top artists"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }
}

async function AlbumsSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  try {
    const albums = await getUserTopReleaseGroups(name, range, 24);
    return <TopAlbumsGrid albums={albums} />;
  } catch (err) {
    return (
      <EmptyState
        title="Couldn't load top albums"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }
}

async function TracksSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  try {
    const tracks = await getUserTopRecordings(name, range, 25);
    return <TopTracksList tracks={tracks} />;
  } catch (err) {
    return (
      <EmptyState
        title="Couldn't load top tracks"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }
}

async function TopTracksCta({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  let tracks: ReturnType<typeof topRecordingsToParachordTracks> = [];
  try {
    const recordings = await getUserTopRecordings(name, range, 100);
    tracks = topRecordingsToParachordTracks(recordings);
  } catch {
    // Both buttons still render; their actions just no-op when empty.
  }
  const title = `${name} — Top tracks (${range.replace(/_/g, " ")})`;
  return (
    <div className="flex items-center gap-2">
      <OpenInParachordButton
        kind="playlist"
        tracks={tracks}
        title={title}
        creator={name}
      />
      <TrackListActionsMenu
        title={title}
        creator={name}
        tracks={tracks}
        xspfUrl={`/api/user/${encodeURIComponent(name)}/top-tracks.xspf?range=${range}`}
        xspfFilename={`${name}-top-tracks-${range}`}
        triggerLabel="Top-tracks actions"
      />
    </div>
  );
}

async function ActivitySection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  try {
    const buckets = await getListeningActivity(name, range);
    return <ListeningActivityChart buckets={buckets} />;
  } catch {
    return null;
  }
}

async function HeatmapSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  try {
    const data = await getDailyActivity(name, range);
    return <DailyHeatmap data={data} />;
  } catch {
    return null;
  }
}

function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ol>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default async function StatsPage({ params, searchParams }: PageParams) {
  const { name } = await params;
  const { range: rangeParam } = await searchParams;
  const range = parseRange(rangeParam);

  return (
    <PageShell className="pt-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Top items
        </h2>
        <StatRangePicker active={range} />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-12">
          <section>
            <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
              Artists
            </h3>
            <Suspense key={`artists-${range}`} fallback={<ListSkeleton />}>
              <ArtistsSection name={name} range={range} />
            </Suspense>
          </section>

          <section>
            <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
              Albums
            </h3>
            <Suspense key={`albums-${range}`} fallback={<GridSkeleton />}>
              <AlbumsSection name={name} range={range} />
            </Suspense>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs tracking-wide uppercase text-muted-foreground">
                Tracks
              </h3>
              <Suspense key={`tracks-menu-${range}`} fallback={null}>
                <TopTracksCta name={name} range={range} />
              </Suspense>
            </div>
            <Suspense key={`tracks-${range}`} fallback={<ListSkeleton />}>
              <TracksSection name={name} range={range} />
            </Suspense>
          </section>
        </div>

        <aside className="space-y-8">
          <section>
            {/* h2, not h3: sibling of the main column's "Top items"
                h2, not nested under it. Same logical level even
                though visual size is smaller. (#10) */}
            <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
              Listening over time
            </h2>
            <Suspense
              key={`activity-${range}`}
              fallback={<Skeleton className="h-56 w-full rounded-xl" />}
            >
              <ActivitySection name={name} range={range} />
            </Suspense>
          </section>

          <section>
            <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
              Daily heatmap
            </h2>
            <Suspense
              key={`heatmap-${range}`}
              fallback={<Skeleton className="h-40 w-full rounded-xl" />}
            >
              <HeatmapSection name={name} range={range} />
            </Suspense>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}

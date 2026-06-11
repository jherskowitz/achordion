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
import { friendlyListenBrainzError } from "@/lib/upstream-error";
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
  // Default to "year" (last year) — gives a richer picture than
  // "month" for most listeners while staying recent enough that the
  // top items reflect current taste rather than a decade of history.
  return STAT_RANGES.includes(value as StatRange)
    ? (value as StatRange)
    : "year";
}

// Per `react-hooks/error-boundaries`: render-time errors thrown from
// JSX inside a try/catch aren't caught by React (try/catch only sees
// the synchronous throw of the data fetch, not subsequent rendering).
// Resolve data inside the try, then construct JSX outside.
async function ArtistsSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  let artists: Awaited<ReturnType<typeof getUserTopArtists>> | null = null;
  let errorMessage = "";
  try {
    artists = await getUserTopArtists(name, range, 25);
  } catch (err) {
    errorMessage = friendlyListenBrainzError(err);
  }
  if (!artists) {
    return (
      <EmptyState
        title="Couldn't load top artists"
        description={errorMessage}
      />
    );
  }
  return <TopArtistsList artists={artists} />;
}

async function AlbumsSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  let albums: Awaited<ReturnType<typeof getUserTopReleaseGroups>> | null = null;
  let errorMessage = "";
  try {
    albums = await getUserTopReleaseGroups(name, range, 24);
  } catch (err) {
    errorMessage = friendlyListenBrainzError(err);
  }
  if (!albums) {
    return (
      <EmptyState
        title="Couldn't load top albums"
        description={errorMessage}
      />
    );
  }
  return <TopAlbumsGrid albums={albums} />;
}

async function TracksSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  let tracks: Awaited<ReturnType<typeof getUserTopRecordings>> | null = null;
  let errorMessage = "";
  try {
    tracks = await getUserTopRecordings(name, range, 25);
  } catch (err) {
    errorMessage = friendlyListenBrainzError(err);
  }
  if (!tracks) {
    return (
      <EmptyState
        title="Couldn't load top tracks"
        description={errorMessage}
      />
    );
  }
  return <TopTracksList tracks={tracks} />;
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
  let buckets: Awaited<ReturnType<typeof getListeningActivity>> | null = null;
  try {
    buckets = await getListeningActivity(name, range);
  } catch {
    return null;
  }
  return <ListeningActivityChart buckets={buckets} />;
}

async function HeatmapSection({
  name,
  range,
}: {
  name: string;
  range: StatRange;
}) {
  let data: Awaited<ReturnType<typeof getDailyActivity>> | null = null;
  try {
    data = await getDailyActivity(name, range);
  } catch {
    return null;
  }
  return <DailyHeatmap data={data} />;
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
      {/* Range picker stands alone at the top-left — the previous
          "Top items" h2 was redundant once each section header
          carries "Top" itself ("Top Artists", "Top Albums", "Top
          Tracks"). */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <StatRangePicker active={range} />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-12">
          <section>
            <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
              Top Artists
            </h3>
            <Suspense key={`artists-${range}`} fallback={<ListSkeleton />}>
              <ArtistsSection name={name} range={range} />
            </Suspense>
          </section>

          <section>
            <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
              Top Albums
            </h3>
            <Suspense key={`albums-${range}`} fallback={<GridSkeleton />}>
              <AlbumsSection name={name} range={range} />
            </Suspense>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs tracking-wide uppercase text-muted-foreground">
                Top Tracks
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
            {/* h2 (sibling of main-column section h2-equivalents):
                this aside lives at the same logical level as the
                Top Artists / Albums / Tracks sections, not nested
                under them. (#10) */}
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

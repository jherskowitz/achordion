import { Suspense } from "react";
import {
  getListeningActivity,
  getDailyActivity,
  STAT_RANGES,
  type StatRange,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { StatRangePicker } from "@/components/achordion/stat-range-picker";
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
    : "year";
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
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't load listening activity"
        description={err instanceof Error ? err.message : ""}
      />
    );
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
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't load daily activity"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }
}

export default async function ChartsPage({ params, searchParams }: PageParams) {
  const { name } = await params;
  const { range: rangeParam } = await searchParams;
  const range = parseRange(rangeParam);

  return (
    <PageShell className="pt-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Activity
        </h2>
        <StatRangePicker active={range} />
      </div>

      <section className="mb-12">
        <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
          Listening over time
        </h3>
        <Suspense
          key={`activity-${range}`}
          fallback={<Skeleton className="h-56 w-full rounded-xl" />}
        >
          <ActivitySection name={name} range={range} />
        </Suspense>
      </section>

      <section>
        <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
          Daily heatmap
        </h3>
        <Suspense
          key={`heatmap-${range}`}
          fallback={<Skeleton className="h-56 w-full rounded-xl" />}
        >
          <HeatmapSection name={name} range={range} />
        </Suspense>
      </section>
    </PageShell>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import {
  getSitewideTopReleaseGroups,
  getSitewideTopRecordings,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import {
  LbAlbumsChartGrid,
  LbSongsChartList,
} from "@/components/achordion/lb-charts-list";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { topRecordingsToParachordTracks } from "@/lib/parachord-listens";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = { title: "ListenBrainz charts" };

interface PageProps {
  searchParams: Promise<{ tab?: string; range?: string }>;
}

type Tab = "albums" | "songs";
type Range = "week" | "month" | "year" | "all_time";

const RANGES: { code: Range; label: string }[] = [
  { code: "week", label: "Week" },
  { code: "month", label: "Month" },
  { code: "year", label: "Year" },
  { code: "all_time", label: "All time" },
];

function parseTab(v: string | undefined): Tab {
  return v === "songs" ? "songs" : "albums";
}

function parseRange(v: string | undefined): Range {
  if (v === "month" || v === "year" || v === "all_time" || v === "week")
    return v;
  return "week";
}

function chartsHref(next: { tab?: Tab; range?: Range }) {
  const params = new URLSearchParams();
  if (next.tab) params.set("tab", next.tab);
  if (next.range) params.set("range", next.range);
  const qs = params.toString();
  return qs ? `/charts/listenbrainz?${qs}` : "/charts/listenbrainz";
}

async function ChartsBody({ tab, range }: { tab: Tab; range: Range }) {
  if (tab === "songs") {
    const items = await getSitewideTopRecordings(range, 50).catch(() => []);
    return (
      <>
        <Attribution range={range} />
        <LbSongsChartList items={items} />
      </>
    );
  }
  const items = await getSitewideTopReleaseGroups(range, 50).catch(() => []);
  return (
    <>
      <Attribution range={range} />
      <LbAlbumsChartGrid items={items} />
    </>
  );
}

async function SongsChartCta({ range }: { range: Range }) {
  const items = await getSitewideTopRecordings(range, 50).catch(() => []);
  const tracks = topRecordingsToParachordTracks(items);
  const title = `ListenBrainz — Top songs (${range.replace(/_/g, " ")})`;
  return (
    <div className="flex items-center gap-2">
      <OpenInParachordButton
        kind="playlist"
        tracks={tracks}
        title={title}
        creator="ListenBrainz"
      />
      <TrackListActionsMenu
        title={title}
        creator="ListenBrainz"
        tracks={tracks}
        triggerLabel="Songs chart actions"
      />
    </div>
  );
}

function Attribution({ range }: { range: Range }) {
  const rangeLabel = RANGES.find((r) => r.code === range)?.label ?? "Week";
  return (
    <p className="text-muted-foreground/70 mb-4 text-xs tracking-wide uppercase">
      Top sitewide listens · {rangeLabel} ·{" "}
      <Link
        href="https://listenbrainz.org/statistics/top-release-groups"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground underline-offset-4 hover:underline"
      >
        full stats at ListenBrainz →
      </Link>
    </p>
  );
}

function SongsSkeleton() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-7" />
          <Skeleton className="size-12 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function AlbumsSkeleton() {
  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ol>
  );
}

export default async function ListenBrainzChartsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const range = parseRange(sp.range);

  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          ListenBrainz
        </h2>
        <p className="text-muted-foreground/80 mt-1 max-w-3xl text-sm">
          Most-listened albums and tracks across the entire ListenBrainz
          community. Open data, no proprietary weighting.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {tab === "songs" && (
          <Suspense fallback={null}>
            <SongsChartCta range={range} />
          </Suspense>
        )}
        {/* Albums / Songs — same tab strip pattern as Apple Music. */}
        <div
          role="tablist"
          aria-label="Chart kind"
          className="border-border/60 inline-flex rounded-xl border p-1 text-sm"
        >
          {(["albums", "songs"] as const).map((t) => {
            const active = t === tab;
            return (
              <Link
                key={t}
                role="tab"
                aria-selected={active}
                href={chartsHref({ tab: t, range })}
                scroll={false}
                suppressHydrationWarning
                className={cn(
                  "rounded-lg px-3 py-1 capitalize transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </Link>
            );
          })}
        </div>

        {/* Range picker — Week / Month / Year / All time. Same pill
            tab pattern; sits to the right with ml-auto. */}
        <div
          role="tablist"
          aria-label="Time range"
          className="border-border/60 ml-auto inline-flex rounded-xl border p-1 text-sm"
        >
          {RANGES.map((r) => {
            const active = r.code === range;
            return (
              <Link
                key={r.code}
                role="tab"
                aria-selected={active}
                href={chartsHref({ tab, range: r.code })}
                scroll={false}
                suppressHydrationWarning
                className={cn(
                  "rounded-lg px-3 py-1 transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      <Suspense
        key={`${tab}-${range}`}
        fallback={tab === "songs" ? <SongsSkeleton /> : <AlbumsSkeleton />}
      >
        <ChartsBody tab={tab} range={range} />
      </Suspense>
    </PageShell>
  );
}

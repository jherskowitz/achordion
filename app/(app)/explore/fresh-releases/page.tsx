import { Suspense } from "react";
import {
  getFreshReleases,
  getUserFreshReleases,
  type FreshRelease,
} from "@/lib/clients/listenbrainz";
import { auth } from "@/auth";
import { PageShell } from "@/components/achordion/page-shell";
import { FreshReleasesGrid } from "@/components/achordion/fresh-releases-grid";
import { FilterPills } from "@/components/achordion/filter-pills";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  searchParams: Promise<{
    days?: string;
    type?: string;
    source?: string;
  }>;
}

const DAYS_OPTIONS = [
  { value: "7" as const, label: "7 days" },
  { value: "14" as const, label: "14 days" },
  { value: "30" as const, label: "30 days" },
  { value: "90" as const, label: "90 days" },
] as const;

const TYPE_OPTIONS = [
  { value: "studio" as const, label: "Albums + EPs" },
  { value: "album" as const, label: "Albums" },
  { value: "ep" as const, label: "EPs" },
  { value: "single" as const, label: "Singles" },
  { value: "all" as const, label: "All" },
] as const;

const SOURCE_OPTIONS = [
  { value: "following" as const, label: "Following" },
  { value: "all" as const, label: "All" },
] as const;

type DaysValue = (typeof DAYS_OPTIONS)[number]["value"];
type TypeValue = (typeof TYPE_OPTIONS)[number]["value"];
type SourceValue = (typeof SOURCE_OPTIONS)[number]["value"];

function parseDays(v: string | undefined): DaysValue {
  return DAYS_OPTIONS.some((o) => o.value === v) ? (v as DaysValue) : "14";
}
function parseType(v: string | undefined): TypeValue {
  return TYPE_OPTIONS.some((o) => o.value === v) ? (v as TypeValue) : "studio";
}
function parseSource(v: string | undefined): SourceValue {
  return SOURCE_OPTIONS.some((o) => o.value === v)
    ? (v as SourceValue)
    : "following";
}

function applyTypeFilter(
  releases: FreshRelease[],
  type: TypeValue,
): FreshRelease[] {
  if (type === "all") return releases;
  return releases.filter((r) => {
    const primary = r.release_group_primary_type;
    if (!primary) return false;
    if (type === "studio") return primary === "Album" || primary === "EP";
    if (type === "album") return primary === "Album";
    if (type === "ep") return primary === "EP";
    if (type === "single") return primary === "Single";
    return true;
  });
}

async function ReleasesSection({
  days,
  type,
  source,
  username,
}: {
  days: number;
  type: TypeValue;
  source: SourceValue;
  username: string | null;
}) {
  let releases: FreshRelease[];
  try {
    releases =
      source === "following" && username
        ? await getUserFreshReleases(username, { days, sort: "release_date" })
        : await getFreshReleases({ days, sort: "release_date" });
  } catch (err) {
    return (
      <p className="text-muted-foreground text-sm">
        Couldn&apos;t load releases:{" "}
        {err instanceof Error ? err.message : "unknown error"}
      </p>
    );
  }
  const filtered = applyTypeFilter(releases, type);
  return <FreshReleasesGrid releases={filtered} />;
}

function GridSkeleton() {
  return (
    <div className="space-y-12">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-4 h-3 w-24" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function FreshReleasesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const type = parseType(sp.type);
  let source = parseSource(sp.source);

  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  if (!username && source === "following") source = "all";

  return (
    <PageShell className="pt-8">
      {/* Mobile: each filter group lives on its own row, full-width
          so the longer "Albums + EPs / Albums / EPs / Singles / All"
          set doesn't share a line with another group and overflow.
          sm+ goes back to the inline layout with the time-range
          pill right-justified. */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {username && (
          <FilterPills
            param="source"
            active={source}
            options={SOURCE_OPTIONS}
            defaultValue="following"
            ariaLabel="Source"
          />
        )}
        <FilterPills
          param="type"
          active={type}
          options={TYPE_OPTIONS}
          defaultValue="studio"
          ariaLabel="Type"
        />
        <FilterPills
          param="days"
          active={days}
          options={DAYS_OPTIONS}
          defaultValue="14"
          ariaLabel="Time range"
          className="sm:ml-auto"
        />
      </div>

      <Suspense
        key={`${days}-${type}-${source}-${username ?? "anon"}`}
        fallback={<GridSkeleton />}
      >
        <ReleasesSection
          days={Number(days)}
          type={type}
          source={source}
          username={username}
        />
      </Suspense>
    </PageShell>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { PageShell } from "@/components/achordion/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  COLLEGE_CHARTS_COUNTRIES,
  getCollegeChartsCountry,
} from "@/lib/college-charts-countries";
import { getEarshotTop50 } from "@/lib/clients/earshot";
import { getNaccTop30 } from "@/lib/clients/nacc";
import { CollegeChartsAlbumsGrid } from "@/components/achordion/college-charts-list";
import { CountryPicker } from "@/components/achordion/country-picker";

export const metadata = { title: "College radio charts" };

interface PageProps {
  searchParams: Promise<{ country?: string }>;
}

function parseCountry(v: string | undefined): string {
  // Default landing country: United States. Canada / others remain
  // selectable from the picker.
  return v && getCollegeChartsCountry(v) ? v : "us";
}

function chartsHref(next: { country?: string }) {
  const params = new URLSearchParams();
  if (next.country) params.set("country", next.country);
  const qs = params.toString();
  return qs ? `/charts/college-radio?${qs}` : "/charts/college-radio";
}

function ChartHeader({
  weekEnding,
  sourceLabel,
  sourceHref,
}: {
  weekEnding: string | null;
  sourceLabel: string;
  sourceHref: string;
}) {
  return (
    <p className="text-muted-foreground/70 mb-4 text-xs tracking-wide uppercase">
      {weekEnding && <>{weekEnding} · </>}
      <Link
        href={sourceHref}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground underline-offset-4 hover:underline"
      >
        {sourceLabel} →
      </Link>
    </p>
  );
}

async function ChartsBody({ country }: { country: string }) {
  if (country === "ca") {
    const chart = await getEarshotTop50();
    if (chart === null || chart.items.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          !earshot didn&apos;t return a chart. Try again in a minute.
        </p>
      );
    }
    return (
      <>
        <ChartHeader
          weekEnding={
            chart.weekEnding ? `Week ending ${chart.weekEnding}` : null
          }
          sourceLabel="full Top 50 at !earshot"
          sourceHref="https://www.earshot-online.com/charts/index.cfm?intChartTypeID=101"
        />
        <CollegeChartsAlbumsGrid items={chart.items} />
      </>
    );
  }
  if (country === "us") {
    const chart = await getNaccTop30();
    if (chart === null || chart.items.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          NACC didn&apos;t return a chart. Try again in a minute.
        </p>
      );
    }
    return (
      <>
        <ChartHeader
          weekEnding={chart.weekEnding}
          sourceLabel="full Top 200 at NACC"
          sourceHref="https://naccchart.com/charts/"
        />
        <CollegeChartsAlbumsGrid items={chart.items} />
      </>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      No college-radio chart wired for this country yet.
    </p>
  );
}

function ListSkeleton() {
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

export default async function CollegeRadioChartsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const country = parseCountry(sp.country);
  const countryInfo = getCollegeChartsCountry(country)!;

  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          College / community radio
        </h2>
        <p className="text-muted-foreground/80 mt-1 max-w-3xl text-sm">
          What campus and community stations are spinning, by country.
          Updates weekly. Data: {countryInfo.source}.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <CountryPicker
          current={countryInfo}
          options={COLLEGE_CHARTS_COUNTRIES.map((c) => ({
            ...c,
            href: chartsHref({ country: c.code }),
          }))}
        />
      </div>

      <Suspense key={country} fallback={<ListSkeleton />}>
        <ChartsBody country={country} />
      </Suspense>
    </PageShell>
  );
}

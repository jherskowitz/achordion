import Link from "next/link";
import { Suspense } from "react";
import { PageShell } from "@/components/achordion/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  COLLEGE_CHARTS_COUNTRIES,
  getCollegeChartsCountry,
} from "@/lib/college-charts-countries";
import { getEarshotTop50 } from "@/lib/clients/earshot";
import { getNaccTop30 } from "@/lib/clients/nacc";
import { CollegeChartsAlbumsGrid } from "@/components/achordion/college-charts-list";

export const metadata = { title: "College radio charts" };

interface PageProps {
  searchParams: Promise<{ country?: string }>;
}

function parseCountry(v: string | undefined): string {
  return v && getCollegeChartsCountry(v) ? v : "ca";
}

function chartsHref(next: { country?: string }) {
  const params = new URLSearchParams();
  if (next.country) params.set("country", next.country);
  const qs = params.toString();
  return qs ? `/charts/college-radio?${qs}` : "/charts/college-radio";
}

async function ChartsBody({ country }: { country: string }) {
  if (country === "ca") {
    const items = await getEarshotTop50();
    if (items === null) {
      return (
        <p className="text-muted-foreground text-sm">
          !earshot didn&apos;t return a chart. Try again in a minute.
        </p>
      );
    }
    return <CollegeChartsAlbumsGrid items={items} />;
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
        {chart.weekEnding && (
          <p className="text-muted-foreground/70 mb-4 text-xs tracking-wide uppercase">
            {chart.weekEnding}
            {" · "}
            <Link
              href="https://naccchart.com/charts/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              full Top 200 at NACC →
            </Link>
          </p>
        )}
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
        <details className="border-border/60 relative ml-auto rounded-xl border">
          <summary className="hover:bg-muted/40 inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 text-sm select-none">
            <span aria-hidden>{countryInfo.flag}</span>
            {countryInfo.name}
            <span aria-hidden className="text-muted-foreground/70">
              ▾
            </span>
          </summary>
          {/* Floating dropdown — see apple-music page for the same
              anchor/positioning rationale. */}
          <ul className="border-border/60 bg-background absolute right-0 z-50 mt-2 max-h-[60vh] w-56 overflow-y-auto rounded-xl border p-1 shadow-lg">
            {COLLEGE_CHARTS_COUNTRIES.map((c) => {
              const active = c.code === country;
              return (
                <li key={c.code}>
                  <Link
                    href={chartsHref({ country: c.code })}
                    suppressHydrationWarning
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span aria-hidden>{c.flag}</span>
                    <span className="flex-1">{c.name}</span>
                    {active && (
                      <span aria-hidden className="text-foreground/70 text-xs">
                        ✓
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      </div>

      <Suspense key={country} fallback={<ListSkeleton />}>
        <ChartsBody country={country} />
      </Suspense>
    </PageShell>
  );
}

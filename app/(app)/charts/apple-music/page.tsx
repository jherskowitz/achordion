import Link from "next/link";
import { Suspense } from "react";
import {
  getAppleAlbumsChart,
  getAppleSongsChart,
  type AppleChartItem,
} from "@/lib/clients/apple-charts";
import {
  CHARTS_COUNTRIES,
  getChartsCountry,
} from "@/lib/apple-charts-countries";
import { PageShell } from "@/components/achordion/page-shell";
import {
  ChartsAlbumsGrid,
  ChartsSongsList,
} from "@/components/achordion/charts-list";
import { CountryPicker } from "@/components/achordion/country-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const metadata = { title: "Apple Music charts" };

interface PageProps {
  searchParams: Promise<{ tab?: string; country?: string }>;
}

type Tab = "albums" | "songs";

function parseTab(v: string | undefined): Tab {
  return v === "songs" ? "songs" : "albums";
}

function parseCountry(v: string | undefined): string {
  return v && getChartsCountry(v) ? v : "us";
}

async function ChartsBody({
  tab,
  country,
}: {
  tab: Tab;
  country: string;
}) {
  const items: AppleChartItem[] | null =
    tab === "songs"
      ? await getAppleSongsChart(country)
      : await getAppleAlbumsChart(country);

  if (items === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Apple Music didn&apos;t return a chart. Try another country, or
        come back in a minute.
      </p>
    );
  }
  return (
    <>
      <p className="text-muted-foreground/70 mb-4 text-xs tracking-wide uppercase">
        Updated daily ·{" "}
        <Link
          href="https://music.apple.com/charts"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          Apple Music charts →
        </Link>
      </p>
      {tab === "songs" ? (
        <ChartsSongsList items={items} />
      ) : (
        <ChartsAlbumsGrid items={items} />
      )}
    </>
  );
}

function SongsSkeleton() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
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

function chartsHref(next: { tab?: Tab; country?: string }) {
  const params = new URLSearchParams();
  if (next.tab) params.set("tab", next.tab);
  if (next.country) params.set("country", next.country);
  return `/charts/apple-music?${params}`;
}

export default async function AppleMusicChartsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const country = parseCountry(sp.country);
  const countryInfo = getChartsCountry(country)!;

  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Apple Music
        </h2>
        <p className="text-muted-foreground/80 mt-1 max-w-3xl text-sm">
          The most-played albums and songs on Apple Music, by country.
          Refreshes daily.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
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
                href={chartsHref({ tab: t, country })}
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

        <CountryPicker
          current={countryInfo}
          options={CHARTS_COUNTRIES.map((c) => ({
            ...c,
            href: chartsHref({ tab, country: c.code }),
          }))}
        />
      </div>

      <Suspense
        key={`${tab}-${country}`}
        fallback={tab === "songs" ? <SongsSkeleton /> : <AlbumsSkeleton />}
      >
        <ChartsBody tab={tab} country={country} />
      </Suspense>
    </PageShell>
  );
}

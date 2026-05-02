import { Suspense } from "react";
import { getCriticalDarlings } from "@/lib/clients/critical-darlings";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import {
  CriticalDarlingCard,
  CriticalDarlingCardSkeleton,
} from "@/components/achordion/critical-darling-card";

export const metadata = { title: "Critical Darlings" };

// Match Parachord's `loadCriticsPicks` behaviour: refresh every few hours
// at the page level too, in case the RSS layer's cache misses.
export const revalidate = 60 * 60 * 4;

export default async function CriticalDarlingsPage() {
  const albums = await getCriticalDarlings();
  if (albums.length === 0) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="No critics' picks right now"
          description="The Critical Darlings feed didn't load — try refreshing in a few minutes."
        />
      </PageShell>
    );
  }
  return (
    <PageShell className="pt-8">
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Critical Darlings
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Top-rated albums from leading music publications, refreshed
            throughout the week.
          </p>
        </div>
        <p className="text-muted-foreground/70 text-xs tabular-nums">
          {albums.length} albums
        </p>
      </header>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {albums.map((album) => (
          <Suspense key={album.id} fallback={<CriticalDarlingCardSkeleton />}>
            <CriticalDarlingCard album={album} />
          </Suspense>
        ))}
      </div>
    </PageShell>
  );
}

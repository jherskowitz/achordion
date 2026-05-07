import { getCriticalDarlings } from "@/lib/clients/critical-darlings";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { CriticalDarlingCard } from "@/components/achordion/critical-darling-card";

export const metadata = { title: "Critical Darlings" };

// Page-level cache mirrors the RSS-fetch cache (12h). Two refreshes
// a day is plenty for "what critics are loving" — the underlying feed
// doesn't move that fast, and a cold revalidation kicks off ~30
// MB-rate-limited cover-art lookups (one per card), so we'd rather
// not blast through that budget on every visit. Next 16's segment-
// config validator wants a literal number; 12h = 43200s.
export const revalidate = 43200;

export default async function CriticalDarlingsPage() {
  const albums = await getCriticalDarlings();
  if (albums.length === 0) {
    return (
      <PageShell className="pt-8">
        <EmptyState
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
      {/* Cards render synchronously now — covers fetch lazily client-
          side via <LazyAlbumCover>, so the per-card Suspense
          boundaries that used to gate on a server-side MB lookup
          aren't needed anymore. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {albums.map((album) => (
          <CriticalDarlingCard key={album.id} album={album} />
        ))}
      </div>
    </PageShell>
  );
}

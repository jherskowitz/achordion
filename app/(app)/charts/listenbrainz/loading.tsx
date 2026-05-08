import { PageShell } from "@/components/achordion/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading skeleton for the ListenBrainz charts page.
 * Shown by Next.js during initial cross-page navigation (when the
 * server is still resolving `getSitewideTopReleaseGroups` /
 * `getSitewideTopRecordings`). Once the page renders, the
 * page-internal <Suspense> boundary takes over for tab / range
 * switches.
 *
 * No tab / range pickers here — `loading.tsx` doesn't receive
 * searchParams so we'd have to render them all in the inactive
 * state, which looks worse than just showing the body skeleton.
 * The persistent <ChartsLayout> still renders the top-level chart-
 * provider tabs (ListenBrainz / Apple Music / College Radio) so
 * the user knows where they are.
 */
export default function Loading() {
  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </header>
      {/* Default to the albums grid since albums is the default tab.
          On the songs tab the user briefly sees the wrong shape
          before the page renders, but it's still clearly a loading
          state. */}
      <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <li key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </li>
        ))}
      </ol>
    </PageShell>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/achordion/page-shell";

/**
 * Route-level loading skeleton for /recording/<mbid>. Mirrors the
 * recording-page layout: breadcrumb → cover + title + byline +
 * favicon row → stats → tags → "Also appears on" grid → top
 * listeners cards.
 *
 * Drives the cross-page soft-navigation transition; the page-
 * internal <Suspense> still handles the in-page streaming once
 * the page itself starts rendering.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="space-y-8 pt-8">
        {/* Breadcrumb */}
        <Skeleton className="h-4 w-48" />

        {/* Header: cover + title + byline + favicons; stats on the right */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="flex min-w-0 items-center gap-5">
            <Skeleton className="aspect-square w-32 shrink-0 rounded-md sm:w-40" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-64" />
              <div className="flex flex-wrap gap-2 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="size-9 rounded-md" />
                ))}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-baseline gap-6">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-1 text-right">
                <Skeleton className="ml-auto h-7 w-20" />
                <Skeleton className="ml-auto h-3 w-14" />
              </div>
            ))}
          </div>
        </div>

        {/* Tag chips row */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>

        {/* "Also appears on" grid + sidebar */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 space-y-12">
            <section>
              <Skeleton className="mb-4 h-4 w-32" />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square w-full rounded-md" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            </section>
          </div>
          <aside>
            <Skeleton className="mb-3 h-3 w-20" />
            <ul className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="size-9 rounded-md" />
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

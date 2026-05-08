import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/achordion/page-shell";

/**
 * Route-level loading skeleton for /artist/<mbid>.
 *
 * Mirrors the real layout — circular artist avatar + eyebrow / title
 * / disambiguation / tag-chips header on the left, listens-listeners
 * stat block on the right, then the main two-column body (popular
 * tracks + similar artists in the sidebar). The page-internal
 * <Suspense> fallback renders the same shape during the initial
 * `getArtist` wait; this loading.tsx kicks in during cross-page
 * soft navigation BEFORE that Suspense even mounts.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="space-y-12 pt-8">
        {/* Header: avatar + title block + stats */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="flex min-w-0 items-center gap-5">
            <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-48" />
              <div className="flex flex-wrap gap-1.5 pt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-16 rounded-full" />
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

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-10">
            {/* Popular tracks */}
            <section>
              <Skeleton className="mb-4 h-4 w-32" />
              <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
                {Array.from({ length: 8 }).map((_, i) => (
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
            </section>

            {/* Discography grid */}
            <section>
              <Skeleton className="mb-4 h-4 w-28" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square w-full rounded-md" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <section>
              <Skeleton className="mb-3 h-3 w-20" />
              <ul className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

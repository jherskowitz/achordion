import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/achordion/page-shell";

/**
 * Route-level loading skeleton for /user/<name> and (by inheritance)
 * its sub-routes that don't define their own loading.tsx — listens,
 * pins, playlists, stats, taste, community.
 *
 * Shape: avatar circle + username + tabs row → main content
 * placeholder. The actual user-header (`<UserPageHeader>`) is not
 * Suspense'd in the page itself, so it'd otherwise paint instantly
 * and leave only the body in skeleton state. Rendering the full
 * page outline here makes the soft-nav transition feel uniform.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="pt-8">
        {/* User header */}
        <div className="mb-8 flex items-center gap-5">
          <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>

        {/* Profile sub-tabs */}
        <div className="border-border/60 mb-8 flex gap-6 border-b pb-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>

        {/* Body — generic two-column placeholder. */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-8">
            <Skeleton className="aspect-[4/1] w-full rounded-2xl" />
            <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="size-12 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-3 w-12" />
                </li>
              ))}
            </ul>
          </div>
          <aside className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ))}
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

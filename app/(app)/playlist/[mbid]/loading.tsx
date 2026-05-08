import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/achordion/page-shell";

/**
 * Route-level loading skeleton for /playlist/<mbid>. Mirrors the
 * playlist-page layout — cover mosaic + title + creator + meta
 * row, then the tracklist below.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="space-y-8 pt-8">
        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <Skeleton className="aspect-square w-40 shrink-0 rounded-md sm:w-48" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-4 w-56" />
            <div className="flex gap-2 pt-3">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>

        {/* Tracklist */}
        <div className="border-border/60 rounded-xl border px-4">
          <ol className="divide-border/60 divide-y">
            {Array.from({ length: 12 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 py-2.5">
                <Skeleton className="size-8" />
                <Skeleton className="size-12 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-12 shrink-0" />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </PageShell>
  );
}

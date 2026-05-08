import { PageShell } from "@/components/achordion/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading skeleton for the college / community radio
 * charts page. Same shape rationale as the ListenBrainz loading.tsx
 * — see that file for the full notes on why we skip the picker.
 */
export default function Loading() {
  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
      </header>
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

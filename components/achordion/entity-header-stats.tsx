import { Skeleton } from "@/components/ui/skeleton";

/**
 * Listens + listeners pair rendered as the right-justified header
 * stats block on entity detail pages (track, album). Big-numbers
 * stacked over uppercase eyebrow labels — same visual treatment
 * across entity types so the headers feel like they belong to the
 * same product.
 *
 * Renders nothing when both values are undefined (LB endpoint
 * 204/404'd, or stats haven't resolved yet).
 */
export function EntityHeaderStats({
  totalListens,
  totalListeners,
}: {
  totalListens: number | undefined;
  totalListeners: number | undefined;
}) {
  if (totalListens === undefined && totalListeners === undefined) return null;
  return (
    <div className="flex items-baseline gap-6 text-right">
      {totalListens !== undefined && (
        <div>
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {totalListens.toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            listens
          </p>
        </div>
      )}
      {totalListeners !== undefined && (
        <div>
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {totalListeners.toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            listeners
          </p>
        </div>
      )}
    </div>
  );
}

/** Skeleton placeholder for the stats block while LB resolves. */
export function EntityHeaderStatsSkeleton() {
  return (
    <div className="flex items-baseline gap-6 text-right">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="ml-auto h-7 w-20" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

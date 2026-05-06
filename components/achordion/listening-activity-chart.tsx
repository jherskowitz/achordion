import { cn } from "@/lib/utils";

interface ActivityBucket {
  from_ts: number;
  to_ts: number;
  listen_count: number;
  time_range: string;
}

export function ListeningActivityChart({
  buckets,
}: {
  buckets: ActivityBucket[];
}) {
  if (buckets.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No listening activity for this range.
      </p>
    );
  }
  const max = Math.max(...buckets.map((b) => b.listen_count), 1);
  const total = buckets.reduce((sum, b) => sum + b.listen_count, 0);
  const peak = buckets.reduce((a, b) =>
    a.listen_count > b.listen_count ? a : b,
  );

  // Bucket density determines bar gap. The chart lives in a ~240px
  // sidebar; LB's `range=month` returns 61 daily buckets and `quarter`
  // returns 182, so a flat gap-1 (4px) consumes the full container in
  // gaps alone and crushes the bars to invisible. Shrink the gap as
  // density grows; very dense ranges get no gap at all so each day
  // still gets a real pixel.
  const gapClass =
    buckets.length > 60
      ? "gap-0"
      : buckets.length > 30
        ? "gap-px"
        : "gap-1 sm:gap-1.5";

  return (
    <div>
      <div className="text-muted-foreground mb-4 flex items-baseline gap-6 text-xs">
        <span>
          <span className="text-foreground text-2xl font-semibold tabular-nums">
            {total.toLocaleString()}
          </span>{" "}
          listens
        </span>
        <span>
          peak:{" "}
          <span className="text-foreground tabular-nums">
            {peak.listen_count.toLocaleString()}
          </span>{" "}
          ({peak.time_range})
        </span>
      </div>
      <div className="border-border/60 rounded-xl border p-4">
        <div className={cn("flex h-48 items-end", gapClass)}>
          {buckets.map((b) => {
            const pct = (b.listen_count / max) * 100;
            return (
              <div
                key={`${b.from_ts}-${b.to_ts}`}
                className="bg-foreground/70 hover:bg-foreground min-h-[1px] flex-1 rounded-t-sm transition-colors"
                style={{ height: `${pct}%` }}
                title={`${b.time_range}: ${b.listen_count.toLocaleString()} listens`}
              />
            );
          })}
        </div>
        <div className="text-muted-foreground mt-2 flex justify-between text-[10px] tabular-nums">
          <span>{buckets[0]?.time_range}</span>
          <span>{buckets[buckets.length - 1]?.time_range}</span>
        </div>
      </div>
    </div>
  );
}

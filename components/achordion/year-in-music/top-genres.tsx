import type { YimTopGenre } from "@/lib/clients/listenbrainz";

export function YearTopGenres({
  genres,
  limit = 12,
}: {
  genres: YimTopGenre[];
  limit?: number;
}) {
  if (!genres || genres.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No genre data — your top tracks may lack tag coverage.
      </p>
    );
  }
  const sliced = genres.slice(0, limit);
  const max = sliced[0]?.genre_count ?? 1;
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {sliced.map((g, i) => {
        const pct = Math.round((g.genre_count / max) * 100);
        return (
          <li
            key={`${g.genre}-${i}`}
            className="flex items-center gap-3 py-3"
          >
            <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium capitalize">
                {g.genre}
              </p>
              <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
                <div
                  className="bg-foreground/70 h-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
              {g.genre_count_percent.toFixed(1)}%
            </span>
          </li>
        );
      })}
    </ol>
  );
}

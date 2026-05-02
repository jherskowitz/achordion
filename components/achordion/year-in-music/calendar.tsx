import type { YimListensPerDay } from "@/lib/clients/listenbrainz";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface DayCell {
  date: Date;
  count: number;
}

function buildGrid(year: number, days: YimListensPerDay[]): DayCell[][] {
  const byTs = new Map<string, number>();
  for (const d of days) {
    const date = new Date(d.from_ts * 1000);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    byTs.set(key, d.listen_count);
  }
  // 53 weeks worth of columns, 7 rows (Sun..Sat). We start the grid on the
  // Sunday on or before Jan 1 so weeks line up cleanly.
  const start = new Date(Date.UTC(year, 0, 1));
  const startDow = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - startDow);

  const weeks: DayCell[][] = [];
  for (let w = 0; w < 53; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
      week.push({ date, count: byTs.get(key) ?? 0 });
    }
    weeks.push(week);
  }
  return weeks;
}

function intensity(count: number, max: number): string {
  if (count === 0) return "bg-muted/30";
  const ratio = count / max;
  if (ratio < 0.15) return "bg-foreground/15";
  if (ratio < 0.35) return "bg-foreground/30";
  if (ratio < 0.6) return "bg-foreground/55";
  if (ratio < 0.85) return "bg-foreground/75";
  return "bg-foreground";
}

export function YearCalendarHeatmap({
  year,
  days,
}: {
  year: number;
  days: YimListensPerDay[];
}) {
  if (!days || days.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No daily activity recorded for {year}.
      </p>
    );
  }
  const inYear = days.filter((d) => {
    const dt = new Date(d.from_ts * 1000);
    return dt.getUTCFullYear() === year;
  });
  const total = inYear.reduce((s, d) => s + d.listen_count, 0);
  const peak = inYear.reduce(
    (a, b) => (b.listen_count > (a?.listen_count ?? 0) ? b : a),
    inYear[0],
  );
  const max = Math.max(...inYear.map((d) => d.listen_count), 1);
  const grid = buildGrid(year, days);

  // Month label positions: place a label at the column where a new month's
  // first-of-the-month appears in row 0 (clamped — first week may overflow).
  const monthLabels: { col: number; label: string }[] = [];
  for (let w = 0; w < grid.length; w++) {
    for (let d = 0; d < 7; d++) {
      const date = grid[w][d].date;
      if (
        date.getUTCFullYear() === year &&
        date.getUTCDate() <= 7 &&
        d === 0
      ) {
        monthLabels.push({ col: w, label: MONTHS[date.getUTCMonth()] });
        break;
      }
    }
  }

  return (
    <div className="border-border/60 rounded-xl border p-4">
      <div className="text-muted-foreground mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        <span>
          <span className="text-foreground tabular-nums">
            {total.toLocaleString()}
          </span>{" "}
          listens
        </span>
        {peak && (
          <span>
            peak{" "}
            <span className="text-foreground tabular-nums">
              {peak.listen_count.toLocaleString()}
            </span>{" "}
            on{" "}
            <span className="text-foreground">{peak.time_range}</span>
          </span>
        )}
        <span className="text-muted-foreground/70">darker = more</span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div
            className="grid gap-1 text-[10px]"
            style={{
              gridTemplateColumns: `repeat(${grid.length}, minmax(11px, 1fr))`,
            }}
          >
            {Array.from({ length: grid.length }).map((_, i) => {
              const lbl = monthLabels.find((m) => m.col === i);
              return (
                <div
                  key={i}
                  className="text-muted-foreground/70 text-left"
                >
                  {lbl?.label ?? ""}
                </div>
              );
            })}
          </div>
          <div
            className="grid gap-1"
            style={{
              gridTemplateRows: "repeat(7, minmax(11px, 1fr))",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(11px, 1fr)",
            }}
          >
            {grid.flat().map((cell, i) => {
              const inThisYear = cell.date.getUTCFullYear() === year;
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-[2px] ${
                    inThisYear ? intensity(cell.count, max) : "bg-transparent"
                  }`}
                  title={
                    inThisYear
                      ? `${cell.date.toISOString().slice(0, 10)} — ${cell.count.toLocaleString()} listens`
                      : ""
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

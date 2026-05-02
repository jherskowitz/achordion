const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type DailyActivity = Record<string, Array<{ hour: number; listen_count: number }>>;

export function DailyHeatmap({ data }: { data: DailyActivity }) {
  const days = DAYS.filter((d) => data[d]);
  if (days.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No daily activity for this range.
      </p>
    );
  }

  let max = 1;
  for (const day of days) {
    for (const slot of data[day]) {
      if (slot.listen_count > max) max = slot.listen_count;
    }
  }

  function intensity(count: number): string {
    if (count === 0) return "bg-muted/30";
    const ratio = count / max;
    if (ratio < 0.15) return "bg-foreground/15";
    if (ratio < 0.35) return "bg-foreground/30";
    if (ratio < 0.6) return "bg-foreground/55";
    if (ratio < 0.85) return "bg-foreground/75";
    return "bg-foreground";
  }

  const total = days.reduce(
    (sum, d) => sum + data[d].reduce((s, h) => s + h.listen_count, 0),
    0,
  );

  return (
    <div className="border-border/60 rounded-xl border p-4">
      <div className="text-muted-foreground mb-3 text-xs">
        <span className="text-foreground tabular-nums">
          {total.toLocaleString()}
        </span>{" "}
        listens · darker = more
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1 text-[10px]"
          style={{
            gridTemplateColumns: "auto repeat(24, minmax(12px, 1fr))",
          }}
        >
          <div />
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="text-muted-foreground/70 text-center tabular-nums"
            >
              {h % 6 === 0 ? h : ""}
            </div>
          ))}
          {days.map((day) => (
            <div key={day} className="contents">
              <div className="text-muted-foreground pr-2 text-right">
                {day.slice(0, 3)}
              </div>
              {Array.from({ length: 24 }).map((_, hour) => {
                const slot = data[day].find((s) => s.hour === hour);
                const count = slot?.listen_count ?? 0;
                return (
                  <div
                    key={hour}
                    className={`aspect-square rounded-[3px] ${intensity(count)}`}
                    title={`${day} ${hour}:00 — ${count.toLocaleString()} listens`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

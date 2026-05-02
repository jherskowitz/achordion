"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface YearBucket {
  year: number;
  count: number;
}

function bucketByDecade(
  data: Record<string, number>,
): { decade: string; count: number }[] {
  const buckets = new Map<number, number>();
  for (const [yearStr, count] of Object.entries(data)) {
    const year = Number(yearStr);
    if (!Number.isFinite(year) || year < 1900) continue;
    const decade = Math.floor(year / 10) * 10;
    buckets.set(decade, (buckets.get(decade) ?? 0) + count);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([decade, count]) => ({ decade: `${decade}s`, count }));
}

const config = {
  count: { label: "Listens", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DecadesChart({
  data,
  mode = "decade",
}: {
  data: Record<string, number>;
  mode?: "decade" | "year";
}) {
  const decadeRows = bucketByDecade(data);
  if (decadeRows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No release-year data for your top tracks this year.
      </p>
    );
  }
  if (mode === "year") {
    const years: YearBucket[] = Object.entries(data)
      .map(([y, c]) => ({ year: Number(y), count: c }))
      .filter((r) => Number.isFinite(r.year) && r.year >= 1900)
      .sort((a, b) => a.year - b.year);
    return (
      <ChartContainer
        config={config}
        className="border-border/60 aspect-[16/6] rounded-xl border p-4"
      >
        <BarChart data={years} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={2} />
        </BarChart>
      </ChartContainer>
    );
  }
  return (
    <ChartContainer
      config={config}
      className="border-border/60 aspect-[16/6] rounded-xl border p-4"
    >
      <BarChart data={decadeRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="decade"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

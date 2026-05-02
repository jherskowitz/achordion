"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { YimArtistEvolution } from "@/lib/clients/listenbrainz";

const MONTH_ORDER = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH = [
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

function slug(s: string, i: number): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base ? `a-${base}` : `a-${i}`;
}

type Row = {
  month: string;
} & Record<string, string | number>;

export function ArtistEvolutionChart({
  rows,
  topN = 5,
}: {
  rows: YimArtistEvolution[];
  topN?: number;
}) {
  if (!rows || rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Not enough monthly listening data for this view.
      </p>
    );
  }

  // Pick top-N artists by total listens across the year.
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.artist_name, (totals.get(r.artist_name) ?? 0) + r.listen_count);
  }
  const top = [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([name]) => name);

  // Slug each artist name so it's a valid CSS-var key — chart config keys
  // become `--color-<key>`.
  const keyOf = new Map<string, string>();
  top.forEach((name, i) => keyOf.set(name, slug(name, i)));

  // Build month-indexed rows.
  const byMonth = new Map<string, Row>();
  MONTH_ORDER.forEach((m, i) => {
    const row: Row = { month: SHORT_MONTH[i] };
    for (const name of top) row[keyOf.get(name)!] = 0;
    byMonth.set(m, row);
  });
  for (const r of rows) {
    const key = keyOf.get(r.artist_name);
    if (!key) continue;
    const row = byMonth.get(r.time_unit);
    if (!row) continue;
    row[key] = ((row[key] as number) ?? 0) + r.listen_count;
  }
  const data = MONTH_ORDER.map((m) => byMonth.get(m)!);

  const config: ChartConfig = {};
  top.forEach((name, i) => {
    config[keyOf.get(name)!] = {
      label: name,
      color: `var(--chart-${(i % 5) + 1})`,
    };
  });

  return (
    <ChartContainer
      config={config}
      className="border-border/60 aspect-[16/7] rounded-xl border p-4"
    >
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        {top.map((name) => {
          const key = keyOf.get(name)!;
          return (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="a"
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={0.55}
            />
          );
        })}
      </AreaChart>
    </ChartContainer>
  );
}

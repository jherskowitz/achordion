export const STAT_RANGES = [
  "this_week",
  "week",
  "this_month",
  "month",
  "this_year",
  "year",
  "all_time",
] as const;

export type StatRange = (typeof STAT_RANGES)[number];

export const STAT_RANGE_LABELS: Record<StatRange, string> = {
  this_week: "This week",
  week: "Last week",
  this_month: "This month",
  month: "Last month",
  this_year: "This year",
  year: "Last year",
  all_time: "All time",
};

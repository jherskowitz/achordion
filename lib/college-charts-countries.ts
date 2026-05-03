/**
 * College / community-radio chart country list.
 *
 * Each country code maps to a different national feed:
 *   - `ca` → !earshot (https://www.earshot-online.com) — Canada's NCRA
 *   - `us` → NACC 200 (https://naccchart.com/charts/) — US college chart
 *
 * NACC publishes a paid Top 200; we surface only the publicly-visible
 * Top 30 with attribution + a link back to naccchart.com.
 */

export interface CollegeChartsCountry {
  code: string;
  name: string;
  /** Country flag emoji for the picker — purely decorative. */
  flag: string;
  /** Short attribution shown in the page header below the H1. */
  source: string;
}

export const COLLEGE_CHARTS_COUNTRIES: CollegeChartsCountry[] = [
  {
    code: "ca",
    name: "Canada",
    flag: "🇨🇦",
    source: "!earshot weekly Top 50",
  },
  {
    code: "us",
    name: "United States",
    flag: "🇺🇸",
    source: "NACC weekly Top 30 (public chart)",
  },
];

export function getCollegeChartsCountry(
  code: string,
): CollegeChartsCountry | null {
  return COLLEGE_CHARTS_COUNTRIES.find((c) => c.code === code) ?? null;
}
